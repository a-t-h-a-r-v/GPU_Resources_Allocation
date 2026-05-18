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

type Device struct {
	ID               uint   `gorm:"primaryKey" json:"id"`
	ResourceID       string `json:"resourceId"`
	GPUNumber        string `json:"gpuNumber"`
	ResourceType     string `json:"resourceType"`
	IPAddress        string `json:"ipAddress"`
	Username         string `json:"username"`
	Password         string `json:"password"`
	CredentialActive bool   `json:"credentialActive"`
	Status           string `gorm:"default:'Available'" json:"status"`
}

type Allocation struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	RequestID uint      `json:"requestId"`
	DeviceID  uint      `json:"deviceId"`
	Username  string    `json:"username"` // NEW: Allocation specific username
	Password  string    `json:"password"` // NEW: Allocation specific password
	StartDate time.Time `json:"startDate"`
	EndDate   time.Time `json:"endDate"`
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

	var db *gorm.DB
	var err error

	// NEW: Smart retry loop to handle Docker's race condition
	for i := 1; i <= 10; i++ {
		db, err = gorm.Open(mysql.Open(dsn), &gorm.Config{})
		if err == nil {
			log.Println("✅ Successfully connected to the database!")
			break
		}
		log.Printf("⚠️ Attempt %d: Database not ready yet. Retrying in 3 seconds...", i)
		time.Sleep(3 * time.Second)
	}

	if err != nil {
		log.Fatalf("❌ Failed to connect to database after 10 attempts: %v", err)
	}

	// AutoMigrate creates the tables automatically
	log.Println("⚙️ Running AutoMigrate...")
	err = db.AutoMigrate(&Request{}, &Device{}, &Allocation{})
	if err != nil {
		log.Fatalf("❌ Failed to migrate database: %v", err)
	}

	return db
}

func sendOTPEmail(to, otp string) error {
	from := os.Getenv("SMTP_EMAIL")
	password := os.Getenv("SMTP_PASSWORD")
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")

	if from == "" || password == "" {
		log.Printf("\n======================================================")
		log.Printf("⚠️ LOCAL DEV MODE: No SMTP credentials found.")
		log.Printf("📧 Simulated email to: %s", to)
		log.Printf("🔑 YOUR OTP IS: %s", otp)
		log.Printf("======================================================\n")
		return nil
	}

	auth := smtp.PlainAuth("", from, password, host)
	msg := []byte("To: " + to + "\r\nSubject: CCF GPU Portal - Your OTP\r\n\r\nYour OTP is: " + otp)
	return smtp.SendMail(host+":"+port, auth, from, []string{to}, msg)
}

// --- NEW: Function to send Allocation Details Email ---
func sendAllocationEmail(to, fullName, resourceId, gpuNumber, username, password, startDate, endDate string) error {
	from := os.Getenv("SMTP_EMAIL")
	smtpPassword := os.Getenv("SMTP_PASSWORD")
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")

	subject := "Subject: CCF GPU Portal - Resource Allocation Details\r\n"
	body := fmt.Sprintf("Dear %s,\r\n\r\nYour request for GPU resources has been approved and allocated.\r\n\r\n"+
		"Allocation Details:\r\n"+
		"- Resource ID: %s\r\n"+
		"- GPU Number: %s\r\n"+
		"- Start Date: %s\r\n"+
		"- End Date: %s\r\n\r\n"+
		"Login Credentials:\r\n"+
		"- Username: %s\r\n"+
		"- Password: %s\r\n\r\n"+
		"Please ensure you follow the acceptable use policy.\r\n\r\nRegards,\r\nAdmin Team\r\n",
		fullName, resourceId, gpuNumber, startDate, endDate, username, password)

	if from == "" || smtpPassword == "" {
		log.Printf("\n======================================================")
		log.Printf("⚠️ LOCAL DEV MODE: No SMTP credentials found.")
		log.Printf("📧 Simulated Allocation Email to: %s", to)
		log.Printf("Message:\n%s", body)
		log.Printf("======================================================\n")
		return nil
	}

	auth := smtp.PlainAuth("", from, smtpPassword, host)
	msg := []byte("To: " + to + "\r\n" + subject + "\r\n" + body)
	return smtp.SendMail(host+":"+port, auth, from, []string{to}, msg)
}

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
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid Session"})
			return
		}
		c.Next()
	}
}

func main() {
	_ = godotenv.Load()

	db := initDB()
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", c.Request.Header.Get("Origin"))
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	api := r.Group("/api")
	{
		api.POST("/auth/otp/send", func(c *gin.Context) {
			var req struct{ Email string `json:"email" binding:"required"` }
			if c.ShouldBindJSON(&req) != nil { return }
			otp := fmt.Sprintf("%06d", rand.Intn(1000000))
			mu.Lock()
			otpStore[req.Email] = otp
			mu.Unlock()
			sendOTPEmail(req.Email, otp)
			c.JSON(http.StatusOK, gin.H{"message": "OTP sent successfully"})
		})

		api.POST("/auth/otp/verify", func(c *gin.Context) {
			var req struct{ Email, OTP string }
			if c.ShouldBindJSON(&req) != nil { return }
			mu.Lock()
			storedOTP, exists := otpStore[req.Email]
			mu.Unlock()
			if !exists || storedOTP != req.OTP {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid OTP"})
				return
			}
			mu.Lock()
			delete(otpStore, req.Email)
			mu.Unlock()
			c.JSON(http.StatusOK, gin.H{"message": "OTP verified"})
		})

		api.POST("/requests", func(c *gin.Context) {
			var form Request
			if c.ShouldBindJSON(&form) != nil { return }
			db.Create(&form)
			c.JSON(http.StatusCreated, gin.H{"message": "Saved"})
		})

		api.POST("/admin/login", func(c *gin.Context) {
			var req struct{ Username, Password string }
			time.Sleep(500 * time.Millisecond)
			if c.ShouldBindJSON(&req) != nil { return }

			if subtle.ConstantTimeCompare([]byte(req.Username), []byte(os.Getenv("ADMIN_USERNAME"))) != 1 ||
				subtle.ConstantTimeCompare([]byte(req.Password), []byte(os.Getenv("ADMIN_PASSWORD"))) != 1 {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
				return
			}

			claims := &AdminClaims{Username: req.Username, RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour))}}
			token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
			tokenString, _ := token.SignedString([]byte(os.Getenv("JWT_SECRET")))

			c.SetCookie("admin_session", tokenString, 86400, "/", "", false, true)
			c.JSON(http.StatusOK, gin.H{"message": "Success"})
		})

		api.POST("/admin/logout", func(c *gin.Context) {
			c.SetCookie("admin_session", "", -1, "/", "", false, true)
			c.JSON(http.StatusOK, gin.H{"message": "Logged out"})
		})

		admin := api.Group("/admin")
		admin.Use(RequireAdminAuth())
		{
			admin.GET("/verify", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"message": "Valid"}) })

			admin.GET("/requests", func(c *gin.Context) {
				var requests []Request
				db.Where("status = ?", "Pending").Order("applied_on asc").Find(&requests)
				c.JSON(http.StatusOK, requests)
			})

			admin.POST("/requests/:id/decline", func(c *gin.Context) {
				reqID := c.Param("id")
				var req Request
				if err := db.First(&req, reqID).Error; err != nil {
					c.JSON(http.StatusNotFound, gin.H{"error": "Request not found"})
					return
				}
				req.Status = "Rejected"
				if err := db.Save(&req).Error; err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decline"})
					return
				}
				c.JSON(http.StatusOK, gin.H{"message": "Request declined successfully"})
			})

			// --- UPDATED: Accepts Username & Password and sends email ---
			admin.POST("/requests/:id/allocate", func(c *gin.Context) {
				reqID := c.Param("id")
				var payload struct {
					DeviceID  uint   `json:"deviceId"`
					StartDate string `json:"startDate"`
					Username  string `json:"username"`
					Password  string `json:"password"`
				}
				if c.ShouldBindJSON(&payload) != nil { return }

				var req Request
				if err := db.First(&req, reqID).Error; err != nil {
					c.JSON(http.StatusNotFound, gin.H{"error": "Request not found"})
					return
				}

				// Fetch device details needed for the email
				var device Device
				if err := db.First(&device, payload.DeviceID).Error; err != nil {
					c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
					return
				}

				startDate, _ := time.Parse("2006-01-02", payload.StartDate)
				endDate := startDate.AddDate(0, 0, req.NumberOfDays)

				err := db.Transaction(func(tx *gorm.DB) error {
					// Save the custom credentials to the allocation table
					if err := tx.Create(&Allocation{
						RequestID: req.ID, 
						DeviceID:  payload.DeviceID, 
						Username:  payload.Username,
						Password:  payload.Password,
						StartDate: startDate, 
						EndDate:   endDate,
					}).Error; err != nil {
						return err
					}
					
					req.Status = "Allocated"
					if err := tx.Save(&req).Error; err != nil {
						return err
					}
					
					return tx.Model(&Device{}).Where("id = ?", payload.DeviceID).Update("status", "Allocated").Error
				})

				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to allocate"})
					return
				}

				// Trigger email asynchronously to avoid blocking the HTTP response
				go sendAllocationEmail(
					req.Email,
					req.FullName,
					device.ResourceID,
					device.GPUNumber,
					payload.Username,
					payload.Password,
					startDate.Format("2006-01-02"),
					endDate.Format("2006-01-02"),
				)

				c.JSON(http.StatusOK, gin.H{"message": "Allocated"})
			})

			// --- UPDATED: Sends Username & Password from DB ---
			admin.GET("/allocations", func(c *gin.Context) {
				type AllocationResult struct {
					AllocationID uint      `json:"allocationId"`
					DeviceID     uint      `json:"deviceId"`
					FullName     string    `json:"fullName"`
					SRN          string    `json:"srn"`
					ResourceID   string    `json:"resourceId"`
					GPUNumber    string    `json:"gpuNumber"`
					Username     string    `json:"username"`
					Password     string    `json:"password"`
					StartDate    time.Time `json:"startDate"`
					EndDate      time.Time `json:"endDate"`
				}
				
				results := []AllocationResult{}
				
				db.Table("allocations").
					Select("allocations.id as allocation_id, allocations.device_id, requests.full_name, requests.srn, devices.resource_id, devices.gpu_number, allocations.username, allocations.password, allocations.start_date, allocations.end_date").
					Joins("left join requests on requests.id = allocations.request_id").
					Joins("left join devices on devices.id = allocations.device_id").
					Order("allocations.start_date desc").
					Scan(&results)

				c.JSON(http.StatusOK, results)
			})

			admin.POST("/gpus", func(c *gin.Context) {
				var device Device
				if c.ShouldBindJSON(&device) != nil { return }
				db.Create(&device)
				c.JSON(http.StatusCreated, device)
			})

			// --- Auto-healing GPU fetch endpoint ---
			admin.GET("/gpus", func(c *gin.Context) {
				var devices []Device
				db.Find(&devices)

				now := time.Now()

				for i, dev := range devices {
					if dev.Status == "Under Maintenance" {
						continue
					}

					var activeAllocations int64
					db.Model(&Allocation{}).
						Where("device_id = ? AND start_date <= ? AND end_date >= ?", dev.ID, now, now).
						Count(&activeAllocations)

					if activeAllocations > 0 {
						if dev.Status != "Allocated" {
							db.Model(&dev).Update("status", "Allocated")
							devices[i].Status = "Allocated"
						}
					} else {
						if dev.Status == "Allocated" {
							db.Model(&dev).Update("status", "Available")
							devices[i].Status = "Available"
						}
					}
				}

				c.JSON(http.StatusOK, devices)
			})

			admin.PATCH("/gpus/:id", func(c *gin.Context) {
				var payload map[string]interface{}
				if c.ShouldBindJSON(&payload) != nil { return }
				db.Model(&Device{}).Where("id = ?", c.Param("id")).Updates(payload)
				c.JSON(http.StatusOK, gin.H{"message": "Updated"})
			})
		}
	}

	r.Run(":" + os.Getenv("PORT"))
}
