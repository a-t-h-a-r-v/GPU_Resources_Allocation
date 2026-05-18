import { useState } from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Read the base URL from the environment, defaulting to "/api" if not set
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export default function Home() {
  const [step, setStep] = useState<"email" | "otp" | "form" | "success">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    fullName: "",
    srn: "",
    department: "",
    contactNumber: "",
    numberOfDays: "",
  });

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/auth/otp/send`, { email });
      setStep("otp");
    } catch (error) {
      alert("Failed to send OTP. Please ensure the email is correct.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/auth/otp/verify`, { email, otp });
      setStep("form");
    } catch (error) {
      alert("Invalid or expired OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const payload = {
        ...formData,
        email,
        numberOfDays: parseInt(formData.numberOfDays, 10) 
      };

      await axios.post(`${API_BASE_URL}/requests`, payload);
      setStep("success");
    } catch (error: any) {
      console.error("Submission error:", error.response?.data || error.message);
      alert("Failed to submit the request. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyles = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
  const labelStyles = "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70";

  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-80px)] bg-muted/40 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>GPU Resource Request</CardTitle>
          <CardDescription>
            {step === "email" && "Enter your student email to authenticate."}
            {step === "otp" && `Enter the OTP sent to ${email}`}
            {step === "form" && "Please fill out the application form."}
            {step === "success" && "Application submitted successfully."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "email" && (
            <form onSubmit={handleSendOTP} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className={labelStyles}>Email Address</label>
                <input
                  id="email"
                  type="email"
                  className={inputStyles}
                  required
                  placeholder="name@kletech.ac.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Sending..." : "Send OTP"}
              </Button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="otp" className={labelStyles}>One-Time Password</label>
                <input
                  id="otp"
                  type="text"
                  className={inputStyles}
                  required
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Verifying..." : "Verify & Proceed"}
              </Button>
            </form>
          )}

          {step === "form" && (
            <form onSubmit={handleSubmitRequest} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="fullName" className={labelStyles}>Full Name</label>
                <input id="fullName" className={inputStyles} required disabled={isLoading} value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label htmlFor="srn" className={labelStyles}>SRN</label>
                <input id="srn" className={inputStyles} required disabled={isLoading} value={formData.srn} onChange={(e) => setFormData({ ...formData, srn: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label htmlFor="department" className={labelStyles}>Department</label>
                <select id="department" required className={inputStyles} disabled={isLoading} value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })}>
                  <option value="" disabled>Select Department</option>
                  <option value="CSE">Computer Science & Engineering</option>
                  <option value="ECE">Electronics & Communication</option>
                  <option value="AIML">AI & Machine Learning</option>
                  <option value="EEE">Electrical & Electronics</option>
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="contact" className={labelStyles}>Contact Number</label>
                <input id="contact" type="tel" className={inputStyles} required disabled={isLoading} value={formData.contactNumber} onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label htmlFor="days" className={labelStyles}>Number of Days Required</label>
                <input id="days" type="number" min="1" max="30" className={inputStyles} required disabled={isLoading} value={formData.numberOfDays} onChange={(e) => setFormData({ ...formData, numberOfDays: e.target.value })} />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                 {isLoading ? "Submitting..." : "Submit Application"}
              </Button>
            </form>
          )}

          {step === "success" && (
            <div className="text-center space-y-4 py-6">
              <div className="text-green-500 font-bold text-xl">Success!</div>
              <p className="text-muted-foreground text-sm">Your application has been recorded. You will be notified once a GPU is allocated.</p>
              <Button variant="outline" onClick={() => setStep("email")}>Submit Another Request</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
