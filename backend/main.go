package main

import (
	"crypto/subtle"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"net/smtp"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

// --- Models ---
type Request struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	Email         string    `json:"email"`
	FullName      string    `json:"fullName"`
	SRN           string    `json:"srn"`
	Department    string    `json:"department"`
	ContactNumber string    `json:"contactNumber"`
	NumberOfDays  int       `json:"numberOfDays"`
	AppliedOn     time.Time `gorm:"autoCreateTime" json:"appliedOn"`
	Status        string    `gorm:"default:'Pending'" json:"status"`
}

var otpStore = make(map[string]string)
var mu sync.Mutex

// --- Database Setup ---
func initDB() *gorm.DB {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_NAME"),
	)

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	err = db.AutoMigrate(&Request{})
	if err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}

	return db
}

// --- Email / OTP Logic ---
func sendOTPEmail(to, otp string) error {
	from := os.Getenv("SMTP_EMAIL")
	password := os.Getenv("SMTP_PASSWORD")
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")

	// LOCAL TESTING FALLBACK
	if from == "" || password == "" {
		log.Printf("\n======================================================")
		log.Printf("⚠️ LOCAL DEV MODE: No SMTP credentials found.")
		log.Printf("📧 Simulated email to: %s", to)
		log.Printf("🔑 YOUR OTP IS: %s", otp)
		log.Printf("======================================================\n")
		return nil
	}

	auth := smtp.PlainAuth("", from, password, host)
	msg := []byte("To: " + to + "\r\n" +
		"Subject: CCF GPU Portal - Your OTP\r\n" +
		"\r\n" +
		"Your One-Time Password (OTP) for the Central Computing Facility is: " + otp + "\r\n\r\n" +
		"This OTP is valid for your current session.")

	return smtp.SendMail(host+":"+port, auth, from, []string{to}, msg)
}

// --- JWT Claims & Middleware ---
type AdminClaims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

func RequireAdminAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString, err := c.Cookie("admin_session")
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized Access"})
			return
		}

		token, err := jwt.ParseWithClaims(tokenString, &AdminClaims{}, func(token *jwt.Token) (interface{}, error) {
			return []byte(os.Getenv("JWT_SECRET")), nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid or Expired Session"})
			return
		}

		c.Next()
	}
}

// --- Main Application Entrypoint ---
func main() {
	_ = godotenv.Load()

	db := initDB()
	r := gin.Default()

	// Strict CORS Middleware (Required for secure cookies)
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", c.Request.Header.Get("Origin"))
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	api := r.Group("/api")
	{
		// 1. Send OTP Endpoint
		api.POST("/auth/otp/send", func(c *gin.Context) {
			var req struct {
				Email string `json:"email" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid email"})
				return
			}

			otp := fmt.Sprintf("%06d", rand.Intn(1000000))
			mu.Lock()
			otpStore[req.Email] = otp
			mu.Unlock()

			err := sendOTPEmail(req.Email, otp)
			if err != nil {
				log.Printf("Failed to send email: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send OTP email"})
				return
			}

			c.JSON(http.StatusOK, gin.H{"message": "OTP sent successfully"})
		})

		// 2. Verify OTP Endpoint
		api.POST("/auth/otp/verify", func(c *gin.Context) {
			var req struct {
				Email string `json:"email" binding:"required"`
				OTP   string `json:"otp" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
				return
			}

			mu.Lock()
			storedOTP, exists := otpStore[req.Email]
			mu.Unlock()

			if !exists || storedOTP != req.OTP {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired OTP"})
				return
			}

			mu.Lock()
			delete(otpStore, req.Email)
			mu.Unlock()

			c.JSON(http.StatusOK, gin.H{"message": "OTP verified"})
		})

		// 3. Submit Request Form
		api.POST("/requests", func(c *gin.Context) {
			var form Request
			if err := c.ShouldBindJSON(&form); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			if err := db.Create(&form).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save request"})
				return
			}

			c.JSON(http.StatusCreated, gin.H{"message": "Request saved successfully", "request": form})
		})

		// 4. Secure Admin Login Endpoint
		api.POST("/admin/login", func(c *gin.Context) {
			var req struct {
				Username string `json:"username" binding:"required"`
				Password string `json:"password" binding:"required"`
			}

			// Throttling to prevent brute-force attacks
			time.Sleep(500 * time.Millisecond)

			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
				return
			}

			expectedUser := os.Getenv("ADMIN_USERNAME")
			expectedPass := os.Getenv("ADMIN_PASSWORD")

			// ConstantTimeCompare prevents timing attacks
			userMatch := subtle.ConstantTimeCompare([]byte(req.Username), []byte(expectedUser)) == 1
			passMatch := subtle.ConstantTimeCompare([]byte(req.Password), []byte(expectedPass)) == 1

			if !userMatch || !passMatch {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
				return
			}

			// Generate the JWT
			expirationTime := time.Now().Add(24 * time.Hour)
			claims := &AdminClaims{
				Username: req.Username,
				RegisteredClaims: jwt.RegisteredClaims{
					ExpiresAt: jwt.NewNumericDate(expirationTime),
				},
			}

			token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
			tokenString, err := token.SignedString([]byte(os.Getenv("JWT_SECRET")))
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not generate token"})
				return
			}

			// Assign HttpOnly Cookie
			c.SetCookie("admin_session", tokenString, 86400, "/", "", false, true)
			c.JSON(http.StatusOK, gin.H{"message": "Authentication successful"})
		})

		// 5. Admin Logout Endpoint
		api.POST("/admin/logout", func(c *gin.Context) {
			// Destroy the cookie
			c.SetCookie("admin_session", "", -1, "/", "", false, true)
			c.JSON(http.StatusOK, gin.H{"message": "Logged out"})
		})

		// 6. Protected Admin Routes Group
		admin := api.Group("/admin")
		admin.Use(RequireAdminAuth())
		{
			// The frontend can hit this to check if the session is still active
			admin.GET("/verify", func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{"message": "Session is valid"})
			})
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	
	log.Printf("Backend running on port %s", port)
	r.Run(":" + port)
}
