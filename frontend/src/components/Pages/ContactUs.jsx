import React, { useState, useEffect } from "react";
import LandingNavbar from "../Landing/LandingNavbar";
import LandingFooter from "../Landing/LandingFooter";
import "./ContactUs.css";

const ContactUs = ({ onNav }) => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "General",
    message: "",
  });
  const [status, setStatus] = useState(null); // 'success', 'error', 'loading'

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setStatus("loading");

    // Simulate submission / Spam protection delay
    setTimeout(() => {
      console.log("Form Submitted:", formData);
      setStatus("success");
      setFormData({ name: "", email: "", subject: "General", message: "" });

      // Clear success message after 5 seconds
      setTimeout(() => setStatus(null), 5000);
    }, 1500);
  };

  return (
    <div className="page-wrapper contact-page">
      <LandingNavbar onStart={() => onNav("SPORT_SELECT")} onNav={onNav} />

      <main className="container" style={{ paddingTop: "150px" }}>
        <div style={{ textAlign: "center", marginBottom: "4rem" }}>
          <h1 className="hero-title" style={{ fontSize: "5rem" }}>
            Get in <span className="text-gradient">Touch</span>
          </h1>
          <p className="hero-description" style={{ margin: "2rem auto" }}>
            Questions, feedback, or ready to build? We're listening.
          </p>
        </div>

        <div className="contact-grid">
          {/* Contact Form */}
          <section className="contact-form-section glass-panel">
            {status === "success" && (
              <div className="status-message status-success">
                ✅ Message sent successfully! We'll get back to you soon.
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  name="name"
                  placeholder="Full Name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  name="email"
                  placeholder="name@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Subject</label>
                <select
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                >
                  <option value="General">General Inquiry</option>
                  <option value="Creator">Content Creator / Partner</option>
                  <option value="Validator">Validator / Developer</option>
                  <option value="Support">Technical Support</option>
                </select>
              </div>

              <div className="form-group">
                <label>Message</label>
                <textarea
                  name="message"
                  rows="6"
                  placeholder="How can we help?"
                  value={formData.message}
                  onChange={handleChange}
                  required
                ></textarea>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg btn-block"
                disabled={status === "loading"}
              >
                {status === "loading"
                  ? "Encrypting Message..."
                  : "Send Message"}
              </button>
            </form>
          </section>

          {/* Contact Info & Socials */}
          <aside className="contact-info-section">
            <div className="info-card glass-panel">
              <h3>Community Hub</h3>
              <p>
                Join the conversation and get real-time support from the
                community.
              </p>
              <div className="social-platforms" style={{ marginTop: "1.5rem" }}>
                <a href="#" className="social-btn">
                  <span className="social-icon-large">𝕏</span>
                  <span>Twitter</span>
                </a>
                <a href="#" className="social-btn">
                  <span className="social-icon-large">👾</span>
                  <span>Discord</span>
                </a>
                <a href="#" className="social-btn">
                  <span className="social-icon-large">🐙</span>
                  <span>GitHub</span>
                </a>
              </div>
            </div>

            <div className="info-card glass-panel">
              <h3>Direct Support</h3>
              <p>Prefer the classic way? Reach out to our team directly.</p>
              <p
                style={{ marginTop: "1rem", color: "#fff", fontWeight: "bold" }}
              >
                support@boxmeout.xyz
              </p>
            </div>

            <div className="info-card glass-panel">
              <h3>Partnerships</h3>
              <p>For large-scale collaborations and validator inquiries.</p>
              <div className="partnership-wallet">
                GABC...7XYZ (Partnership Treasury)
              </div>
            </div>

            <div
              className="info-card glass-panel"
              style={{ textAlign: "center" }}
            >
              <h3>Need Help?</h3>
              <p style={{ marginBottom: "1.5rem" }}>
                Check our documentation for guides and FAQs.
              </p>
              <a href="#" className="btn btn-outline btn-block">
                Read Documentation
              </a>
            </div>
          </aside>
        </div>
      </main>

      <LandingFooter onNav={onNav} />
    </div>
  );
};

export default ContactUs;
