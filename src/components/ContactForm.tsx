import { useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Status = "idle" | "submitting" | "success" | "error";

/**
 * Isolated interactive island: contact / enquiry form.
 * Framer Motion is scoped to just this component's status transitions,
 * not the whole page.
 */
export default function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");

    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      // TODO: point this at the real enquiry endpoint (e.g. a Cloudflare
      // Worker/Pages Function, Formspree, or similar) once decided.
      console.log("Contact form submission", Object.fromEntries(data));
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" required autoComplete="name" />
      </div>

      <div>
        <label htmlFor="company">Company (optional)</label>
        <input id="company" name="company" type="text" autoComplete="organization" />
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <div>
        <label htmlFor="phone">Phone</label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" />
      </div>

      <div>
        <label htmlFor="service">Service required</label>
        <select id="service" name="service" defaultValue="">
          <option value="" disabled>
            Select a service
          </option>
          <option value="manned-guarding">Manned guarding</option>
          <option value="event-security">Event security</option>
          <option value="close-protection">Close protection</option>
          <option value="mobile-patrols">Mobile patrols</option>
          <option value="other">Other / not sure</option>
        </select>
      </div>

      <div>
        <label htmlFor="message">Message</label>
        <textarea id="message" name="message" rows={5} required />
      </div>

      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Send enquiry"}
      </button>

      <AnimatePresence mode="wait">
        {status === "success" && (
          <motion.p
            key="success"
            role="status"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            Thank you — your enquiry has been received. A member of our team
            will be in touch shortly.
          </motion.p>
        )}
        {status === "error" && (
          <motion.p
            key="error"
            role="alert"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            Something went wrong sending your enquiry. Please try again or
            call us directly.
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}
