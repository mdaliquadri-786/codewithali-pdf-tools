/**
 * CodeWithAli - Contact & Feedback Route Handler
 * Validates form submissions and processes message creation
 */

let express;
try {
  express = require('express');
} catch (e) {
  const mini = require('../utils/miniExpress');
  express = mini.express;
}

const router = express.Router();

router.post('/', (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required.' });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty.' });
    }

    const contactEntry = {
      id: Date.now().toString(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: (subject || 'General Inquiry').trim(),
      message: message.trim(),
      createdAt: new Date().toISOString()
    };

    console.log('[Contact Message Received]:', contactEntry);

    res.status(200).json({
      success: true,
      message: 'Thank you! Your message has been received successfully.',
      data: { id: contactEntry.id, name: contactEntry.name }
    });
  } catch (error) {
    console.error('Contact route error:', error);
    res.status(500).json({ success: false, error: 'Server error processing contact request.' });
  }
});

module.exports = router;
