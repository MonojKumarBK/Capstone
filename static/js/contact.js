// static/js/contact.js
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contactForm");
  const status = document.getElementById("status");
  const submitBtn = document.getElementById("submitBtn");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.textContent = "";
    submitBtn.disabled = true;

    const payload = {
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      message: document.getElementById("message").value.trim()
    };

    try {
      const res = await fetch("/send_contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        status.style.color = "lightgreen";
        status.textContent = data.message || "Message sent successfully!";
        form.reset();
      } else {
        status.style.color = "salmon";
        status.textContent = data.error || "Failed to send message.";
      }
    } catch (err) {
      status.style.color = "salmon";
      status.textContent = "Network error. Try again later.";
    } finally {
      submitBtn.disabled = false;
    }
  });
});
