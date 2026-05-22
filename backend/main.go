package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"io"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"net/smtp"
	"os"
	"strings"
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
	Username  string    `json:"username"`
	Password  string    `json:"password"`
	StartDate time.Time `json:"startDate"`
	EndDate   time.Time `json:"endDate"`
}

// --- OTP & Concurrency Data ---
type OTPData struct {
	Code      string
	ExpiresAt time.Time
	Attempts  int
}

var otpStore = make(map[string]OTPData)
var mu sync.Mutex

// --- Email Queue (Worker Pool Pattern) ---
type EmailJob struct {
	Type, To, FullName, ResourceID, GPUNumber, IPAddress, Username, Password, StartDate, EndDate, CustomNote, Reason string
	AllocatedDays int
	SRN, Department string // <--- ADD THESE TWO FIELDS
}

var emailQueue = make(chan EmailJob, 100)

// Encrypts a string using AES-GCM
func encryptAES(plaintext string, keyString string) (string, error) {
	key := []byte(keyString)
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, aesGCM.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := aesGCM.Seal(nonce, nonce, []byte(plaintext), nil)
	return hex.EncodeToString(ciphertext), nil
}

// Decrypts an AES-GCM encrypted string
func decryptAES(ciphertextHex string, keyString string) (string, error) {
	key := []byte(keyString)
	ciphertext, err := hex.DecodeString(ciphertextHex)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := aesGCM.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}

func startEmailWorker() {
	go func() {
		for job := range emailQueue {
			if job.Type == "ALLOCATION" {
				sendAllocationEmail(job.To, job.FullName, job.ResourceID, job.GPUNumber, job.IPAddress, job.Username, job.Password, job.StartDate, job.EndDate, job.CustomNote, job.Reason)
			} else if job.Type == "DECLINE" {
				sendDeclineEmail(job.To, job.FullName, job.Reason)
			} else if job.Type == "ADMIN_NOTIFICATION" {
				sendAdminNotificationEmail(job.FullName, job.ResourceID, job.GPUNumber, job.StartDate, job.EndDate, job.AllocatedDays)
			} else if job.Type == "ALLOCATION_REMOVED" {
				sendAllocationRemovedEmail(job.To, job.FullName, job.Reason)
			} else if job.Type == "ALLOCATION_RELOCATED" {
				sendAllocationRelocatedEmail(job.To, job.FullName, job.Reason, job.ResourceID, job.GPUNumber, job.IPAddress, job.Username, job.Password)
			} else if job.Type == "NEW_REQUEST" {
				// ADD THIS NEW BLOCK
				sendNewRequestNotificationEmail(job.FullName, job.To, job.SRN, job.Department, job.AllocatedDays)
			}
		}
	}()
}

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

	log.Println("⚙️ Running AutoMigrate...")
	err = db.AutoMigrate(&Request{}, &Device{}, &Allocation{})
	if err != nil {
		log.Fatalf("❌ Failed to migrate database: %v", err)
	}

	return db
}

// --- Background Job: Auto-Heal GPU Status ---
func startGPUHealer(db *gorm.DB) {
	ticker := time.NewTicker(5 * time.Minute)
	go func() {
		for range ticker.C {
			var devices []Device
			db.Find(&devices)
			now := time.Now()

			for _, dev := range devices {
				if dev.Status == "Under Maintenance" {
					continue
				}

				var activeAllocations int64
				db.Model(&Allocation{}).
					Where("device_id = ? AND start_date <= ? AND end_date >= ?", dev.ID, now, now).
					Count(&activeAllocations)

				if activeAllocations > 0 && dev.Status != "Allocated" {
					db.Model(&dev).Update("status", "Allocated")
				} else if activeAllocations == 0 && dev.Status == "Allocated" {
					db.Model(&dev).Update("status", "Available")
				}
			}
		}
	}()
}

// --- Cryptographically Secure OTP Generator ---
func generateSecureOTP() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(1000000))
	return fmt.Sprintf("%06d", n.Int64())
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

func sendAdminNotificationEmail(fullName, resourceId, gpuNumber, startDate, endDate string, allocatedDays int) error {
	emailsEnv := os.Getenv("NOTIFICATION_EMAILS")
	if emailsEnv == "" {
		return nil
	}

	// Split the comma-separated emails into a slice of strings
	emails := strings.Split(emailsEnv, ",")
	for i := range emails {
		emails[i] = strings.TrimSpace(emails[i])
	}

	from := os.Getenv("SMTP_EMAIL")
	smtpPassword := os.Getenv("SMTP_PASSWORD")
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")

	subject := "Subject: CCF GPU Portal - New Allocation Notice\r\n"
	body := fmt.Sprintf("Hello,\r\n\r\nA new GPU allocation has been successfully made.\r\n\r\nUser: %s\r\nAllocated Duration: %d Days\r\nResource ID: %s\r\nGPU Number: %s\r\nStart Date: %s\r\nEnd Date: %s\r\n\r\nRegards,\r\nCCF GPU Portal System", fullName, allocatedDays, resourceId, gpuNumber, startDate, endDate)

	if from == "" || smtpPassword == "" {
		log.Printf("\n======================================================")
		log.Printf("📧 Simulated Admin Notification Email to: %s", emailsEnv)
		log.Printf("Message:\n%s", body)
		log.Printf("======================================================\n")
		return nil
	}

	auth := smtp.PlainAuth("", from, smtpPassword, host)
	msg := []byte("To: " + emailsEnv + "\r\n" + subject + "\r\n" + body)
	return smtp.SendMail(host+":"+port, auth, from, emails, msg)
}

func sendAllocationEmail(to, fullName, resourceId, gpuNumber, ipAddress, username, password, startDate, endDate, customNote, reductionReason string) error {
	from := os.Getenv("SMTP_EMAIL")
	smtpPassword := os.Getenv("SMTP_PASSWORD")
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")

	subject := "Subject: CCF GPU Portal - Resource Allocation Details\r\n"

	body := fmt.Sprintf("Dear %s,\r\n\r\nYour request for GPU resources has been approved and allocated.\r\n", fullName)

	if reductionReason != "" {
		body += fmt.Sprintf("\r\nNOTE REGARDING DURATION: Your requested duration was reduced. Reason: %s\r\n", reductionReason)
	}

	body += fmt.Sprintf("\r\nAllocation Details:\r\n"+
		"- Resource ID: %s\r\n"+
		"- GPU Number: %s\r\n"+
		"- Start Date: %s\r\n"+
		"- End Date: %s\r\n\r\n"+
		"Login Credentials:\r\n"+
		"- IP Address: %s\r\n"+
		"- Username: %s\r\n"+
		"- Password: %s\r\n",
		resourceId, gpuNumber, startDate, endDate, ipAddress, username, password)

	if customNote != "" {
		body += fmt.Sprintf("\r\nAdmin Note:\r\n%s\r\n", customNote)
	}

	body += "\r\nPlease ensure you follow the acceptable use policy.\r\n\r\nRegards,\r\nAdmin Team\r\n"

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

func sendAllocationRemovedEmail(to, fullName, reason string) error {
	from := os.Getenv("SMTP_EMAIL")
	smtpPassword := os.Getenv("SMTP_PASSWORD")
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")

	subject := "Subject: CCF GPU Portal - Allocation Removed\r\n"
	body := fmt.Sprintf("Dear %s,\r\n\r\nWe regret to inform you that your current GPU allocation has been removed by the administrator.\r\n\r\nReason provided:\r\n%s\r\n\r\nIf you have any questions, please contact the administration.\r\n\r\nRegards,\r\nAdmin Team\r\n", fullName, reason)

	if from == "" || smtpPassword == "" {
		log.Printf("\n======================================================")
		log.Printf("📧 Simulated Allocation Removed Email to: %s", to)
		log.Printf("Message:\n%s", body)
		log.Printf("======================================================\n")
		return nil
	}

	auth := smtp.PlainAuth("", from, smtpPassword, host)
	msg := []byte("To: " + to + "\r\n" + subject + "\r\n" + body)
	return smtp.SendMail(host+":"+port, auth, from, []string{to}, msg)
}

func sendAllocationRelocatedEmail(to, fullName, reason, resourceId, gpuNumber, ipAddress, username, password string) error {
	from := os.Getenv("SMTP_EMAIL")
	smtpPassword := os.Getenv("SMTP_PASSWORD")
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")

	subject := "Subject: CCF GPU Portal - Allocation Relocated\r\n"
	body := fmt.Sprintf("Dear %s,\r\n\r\nYour GPU allocation has been relocated by the administrator.\r\n\r\nReason provided:\r\n%s\r\n\r\nNew Allocation Details:\r\n- Resource ID: %s\r\n- GPU Number: %s\r\n- IP Address: %s\r\n- Username: %s\r\n- Password: %s\r\n\r\nRegards,\r\nAdmin Team\r\n", fullName, reason, resourceId, gpuNumber, ipAddress, username, password)

	if from == "" || smtpPassword == "" {
		log.Printf("\n======================================================")
		log.Printf("📧 Simulated Allocation Relocation Email to: %s", to)
		log.Printf("Message:\n%s", body)
		log.Printf("======================================================\n")
		return nil
	}

	auth := smtp.PlainAuth("", from, smtpPassword, host)
	msg := []byte("To: " + to + "\r\n" + subject + "\r\n" + body)
	return smtp.SendMail(host+":"+port, auth, from, []string{to}, msg)
}

func sendNewRequestNotificationEmail(fullName, userEmail, srn, department string, requestedDays int) error {
	emailsEnv := os.Getenv("NEW_REQUEST_EMAILS")
	if emailsEnv == "" {
		return nil
	}

	// Split the comma-separated emails into a slice of strings
	emails := strings.Split(emailsEnv, ",")
	for i := range emails {
		emails[i] = strings.TrimSpace(emails[i])
	}

	from := os.Getenv("SMTP_EMAIL")
	smtpPassword := os.Getenv("SMTP_PASSWORD")
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")

	subject := "Subject: CCF GPU Portal - New GPU Request Received\r\n"
	body := fmt.Sprintf("Hello,\r\n\r\nA new request for GPU resources has been submitted.\r\n\r\nApplicant Details:\r\nName: %s\r\nEmail: %s\r\nSRN: %s\r\nDepartment: %s\r\nRequested Duration: %d Days\r\n\r\nPlease log in to the admin portal to review this request.\r\n\r\nRegards,\r\nCCF GPU Portal System", fullName, userEmail, srn, department, requestedDays)

	if from == "" || smtpPassword == "" {
		log.Printf("\n======================================================")
		log.Printf("📧 Simulated New Request Notification to: %s", emailsEnv)
		log.Printf("Message:\n%s", body)
		log.Printf("======================================================\n")
		return nil
	}

	auth := smtp.PlainAuth("", from, smtpPassword, host)
	msg := []byte("To: " + emailsEnv + "\r\n" + subject + "\r\n" + body)
	return smtp.SendMail(host+":"+port, auth, from, emails, msg)
}

func sendDeclineEmail(to, fullName, reason string) error {
	from := os.Getenv("SMTP_EMAIL")
	smtpPassword := os.Getenv("SMTP_PASSWORD")
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")

	subject := "Subject: CCF GPU Portal - Request Declined\r\n"
	body := fmt.Sprintf("Dear %s,\r\n\r\nWe regret to inform you that your request for GPU resources has been declined.\r\n\r\nReason provided by Admin:\r\n%s\r\n\r\nIf you have any questions, please contact the administration.\r\n\r\nRegards,\r\nAdmin Team\r\n", fullName, reason)

	if from == "" || smtpPassword == "" {
		log.Printf("\n======================================================")
		log.Printf("⚠️ LOCAL DEV MODE: No SMTP credentials found.")
		log.Printf("📧 Simulated Decline Email to: %s", to)
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
	startGPUHealer(db) // Start background worker
	startEmailWorker() // Start async email queue

	r := gin.Default()

	r.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		allowedOrigins := map[string]bool{
			"http://localhost":      true,
			"http://localhost:80":   true,
			"http://localhost:5173": true,
		}

		if allowedOrigins[origin] {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}
		
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
			var req struct {
				Email string `json:"email" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			otp := generateSecureOTP()
			
			mu.Lock()
			otpStore[req.Email] = OTPData{
				Code:      otp,
				ExpiresAt: time.Now().Add(5 * time.Minute),
				Attempts:  0,
			}
			mu.Unlock()

			sendOTPEmail(req.Email, otp)
			c.JSON(http.StatusOK, gin.H{"message": "OTP sent successfully"})
		})

		api.POST("/auth/otp/verify", func(c *gin.Context) {
			var req struct{ Email, OTP string }
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
				return
			}

			mu.Lock()
			defer mu.Unlock()

			storedOTP, exists := otpStore[req.Email]
			if !exists || time.Now().After(storedOTP.ExpiresAt) {
				delete(otpStore, req.Email)
				c.JSON(http.StatusUnauthorized, gin.H{"error": "OTP expired or not found"})
				return
			}

			if storedOTP.Attempts >= 3 {
				delete(otpStore, req.Email)
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Too many failed attempts. Request a new OTP."})
				return
			}

			if storedOTP.Code != req.OTP {
				storedOTP.Attempts++
				otpStore[req.Email] = storedOTP
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid OTP"})
				return
			}

			delete(otpStore, req.Email)
			c.JSON(http.StatusOK, gin.H{"message": "OTP verified"})
		})

		api.POST("/requests", func(c *gin.Context) {
			var form Request
			if err := c.ShouldBindJSON(&form); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload format"})
				return
			}
			db.Create(&form)

			emailQueue <- EmailJob{
				Type:          "NEW_REQUEST",
				FullName:      form.FullName,
				To:            form.Email,
				SRN:           form.SRN,
				Department:    form.Department,
				AllocatedDays: form.NumberOfDays,
			}

			c.JSON(http.StatusCreated, gin.H{"message": "Saved"})
		})

		api.POST("/admin/login", func(c *gin.Context) {
			var req struct{ Username, Password string }
			time.Sleep(500 * time.Millisecond)
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload format"})
				return
			}

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

				var payload struct {
					Reason string `json:"reason"`
				}
				if err := c.ShouldBindJSON(&payload); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload format"})
					return
				}

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

				emailQueue <- EmailJob{
					Type:     "DECLINE",
					To:       req.Email,
					FullName: req.FullName,
					Reason:   payload.Reason,
				}

				c.JSON(http.StatusOK, gin.H{"message": "Request declined successfully"})
			})

			admin.POST("/requests/:id/allocate", func(c *gin.Context) {
				reqID := c.Param("id")
				var payload struct {
					DeviceID        uint   `json:"deviceId"`
					StartDate       string `json:"startDate"`
					AllocatedDays   int    `json:"allocatedDays"`
					ReductionReason string `json:"reductionReason"`
					EmailNote       string `json:"emailNote"`
					Username        string `json:"username"`
					Password        string `json:"password"`
				}

				if err := c.ShouldBindJSON(&payload); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload format"})
					return
				}

				var req Request
				if err := db.First(&req, reqID).Error; err != nil {
					c.JSON(http.StatusNotFound, gin.H{"error": "Request not found"})
					return
				}

				var device Device
				if err := db.First(&device, payload.DeviceID).Error; err != nil {
					c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
					return
				}

				startDate, err := time.Parse("2006-01-02", payload.StartDate)
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid date format. Expected YYYY-MM-DD"})
					return
				}

				endDate := startDate.AddDate(0, 0, payload.AllocatedDays)

				err = db.Transaction(func(tx *gorm.DB) error {
					encryptedPassword, err := encryptAES(payload.Password, os.Getenv("ENCRYPTION_KEY"))
					if err != nil {
						return err
					}

					if err := tx.Create(&Allocation{
						RequestID: req.ID,
						DeviceID:  payload.DeviceID,
						Username:  payload.Username,
						Password:  encryptedPassword,
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

				emailQueue <- EmailJob{
					Type:       "ALLOCATION",
					To:         req.Email,
					FullName:   req.FullName,
					ResourceID: device.ResourceID,
					GPUNumber:  device.GPUNumber,
					IPAddress:  device.IPAddress,
					Username:   payload.Username,
					Password:   payload.Password,
					StartDate:  startDate.Format("2006-01-02"),
					EndDate:    endDate.Format("2006-01-02"),
					CustomNote: payload.EmailNote,
					Reason:     payload.ReductionReason,
				}

				emailQueue <- EmailJob{
					Type:          "ADMIN_NOTIFICATION",
					FullName:      req.FullName,
					ResourceID:    device.ResourceID,
					GPUNumber:     device.GPUNumber,
					StartDate:     startDate.Format("2006-01-02"),
					EndDate:       endDate.Format("2006-01-02"),
					AllocatedDays: payload.AllocatedDays,
				}

				c.JSON(http.StatusOK, gin.H{"message": "Allocated"})
			})

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

				encryptionKey := os.Getenv("ENCRYPTION_KEY")
				for i := range results {
					if results[i].Password != "" {
						decryptedPass, err := decryptAES(results[i].Password, encryptionKey)
						if err == nil {
							results[i].Password = decryptedPass
						} else {
							results[i].Password = "Error decrypting (bcrypt legacy)"
						}
					}
				}

				c.JSON(http.StatusOK, results)
			})

			admin.POST("/gpus", func(c *gin.Context) {
				var device Device
				if err := c.ShouldBindJSON(&device); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload format"})
					return
				}

				encryptionKey := os.Getenv("ENCRYPTION_KEY")
				encryptedPass, err := encryptAES(device.Password, encryptionKey)
				if err == nil {
					device.Password = encryptedPass
				} else {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to encrypt device password"})
					return
				}

				db.Create(&device)

				device.Password = "********"
				c.JSON(http.StatusCreated, device)
			})

			admin.GET("/gpus", func(c *gin.Context) {
				var devices []Device
				db.Find(&devices)

				encryptionKey := os.Getenv("ENCRYPTION_KEY")

				for i := range devices {
					if devices[i].Password != "" {
						decryptedPass, err := decryptAES(devices[i].Password, encryptionKey)
						if err == nil {
							devices[i].Password = decryptedPass
						} else {
							devices[i].Password = "Error decrypting"
						}
					}
				}

				c.JSON(http.StatusOK, devices)
			})

			admin.PATCH("/gpus/:id", func(c *gin.Context) {
				id := c.Param("id")
				action := c.Query("action") // "remove" or "relocate"
				reason := c.Query("reason")
				newDeviceID := c.Query("newDeviceId")

				var payload map[string]interface{}
				if err := c.ShouldBindJSON(&payload); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload format"})
					return
				}

				// Check if the device is being moved to "Under Maintenance"
				if targetStatus, exists := payload["status"]; exists && targetStatus == "Under Maintenance" {
					var device Device
					if err := db.First(&device, id).Error; err != nil {
						c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
						return
					}

					// If the device is currently allocated, handle the active allocation
					if device.Status == "Allocated" {
						var allocation Allocation
						if err := db.Where("device_id = ? AND start_date <= ? AND end_date >= ?", device.ID, time.Now(), time.Now()).First(&allocation).Error; err == nil {
							var req Request
							db.First(&req, allocation.RequestID)

							if action == "remove" {
								// Remove Allocation
								db.Delete(&allocation)
								req.Status = "Pending"
								db.Save(&req)

								emailQueue <- EmailJob{
									Type:     "ALLOCATION_REMOVED",
									To:       req.Email,
									FullName: req.FullName,
									Reason:   reason,
								}
							} else if action == "relocate" {
								// Relocate Allocation
								var newDevice Device
								if err := db.First(&newDevice, newDeviceID).Error; err != nil || newDevice.Status != "Available" {
									c.JSON(http.StatusBadRequest, gin.H{"error": "Target GPU is invalid or not available"})
									return
								}

								allocation.DeviceID = newDevice.ID
								db.Save(&allocation)

								newDevice.Status = "Allocated"
								db.Save(&newDevice)

								decryptedPass, _ := decryptAES(newDevice.Password, os.Getenv("ENCRYPTION_KEY"))

								emailQueue <- EmailJob{
									Type:       "ALLOCATION_RELOCATED",
									To:         req.Email,
									FullName:   req.FullName,
									Reason:     reason,
									ResourceID: newDevice.ResourceID,
									GPUNumber:  newDevice.GPUNumber,
									IPAddress:  newDevice.IPAddress,
									Username:   newDevice.Username,
									Password:   decryptedPass,
								}
							} else {
								c.JSON(http.StatusBadRequest, gin.H{"error": "Device is actively allocated. Action (remove/relocate) required."})
								return
							}
						}
					}
				}

				if newPass, exists := payload["password"]; exists {
					encryptedPass, err := encryptAES(newPass.(string), os.Getenv("ENCRYPTION_KEY"))
					if err != nil {
						c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to encrypt new password"})
						return
					}
					payload["password"] = encryptedPass
				}

				db.Model(&Device{}).Where("id = ?", id).Updates(payload)
				c.JSON(http.StatusOK, gin.H{"message": "Updated"})
			})

			admin.DELETE("/gpus/:id", func(c *gin.Context) {
				id := c.Param("id")
				action := c.Query("action") // "remove" or "relocate"
				reason := c.Query("reason")
				newDeviceID := c.Query("newDeviceId")

				var device Device
				if err := db.First(&device, id).Error; err != nil {
					c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
					return
				}

				if device.Status == "Allocated" {
					var allocation Allocation
					// Find the active allocation
					if err := db.Where("device_id = ? AND start_date <= ? AND end_date >= ?", device.ID, time.Now(), time.Now()).First(&allocation).Error; err == nil {
						var req Request
						db.First(&req, allocation.RequestID)

						if action == "remove" {
							// 1. Remove Allocation
							db.Delete(&allocation)
							req.Status = "Pending" // Move request back to pending
							db.Save(&req)

							emailQueue <- EmailJob{
								Type:     "ALLOCATION_REMOVED",
								To:       req.Email,
								FullName: req.FullName,
								Reason:   reason,
							}
						} else if action == "relocate" {
							// 2. Relocate Allocation
							var newDevice Device
							if err := db.First(&newDevice, newDeviceID).Error; err != nil || newDevice.Status != "Available" {
								c.JSON(http.StatusBadRequest, gin.H{"error": "Target GPU is invalid or not available"})
								return
							}

							allocation.DeviceID = newDevice.ID
							db.Save(&allocation)

							newDevice.Status = "Allocated"
							db.Save(&newDevice)

							decryptedPass, _ := decryptAES(newDevice.Password, os.Getenv("ENCRYPTION_KEY"))

							emailQueue <- EmailJob{
								Type:       "ALLOCATION_RELOCATED",
								To:         req.Email,
								FullName:   req.FullName,
								Reason:     reason,
								ResourceID: newDevice.ResourceID,
								GPUNumber:  newDevice.GPUNumber,
								IPAddress:  newDevice.IPAddress,
								Username:   newDevice.Username,
								Password:   decryptedPass,
							}
						} else {
							c.JSON(http.StatusBadRequest, gin.H{"error": "Device is actively allocated. Action (remove/relocate) required."})
							return
						}
					}
				}

				// Clear past allocations tied to this device to prevent Foreign Key constraints failing
				db.Where("device_id = ?", id).Delete(&Allocation{})

				if err := db.Delete(&Device{}, id).Error; err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete device"})
					return
				}
				c.JSON(http.StatusOK, gin.H{"message": "Device deleted successfully"})
			})
		}
	}

	r.Run(":" + os.Getenv("PORT"))
}
