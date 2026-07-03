import { sendContactEmail } from '../utils/emailService.js';

export const submitContactForm = async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, and message are required fields.',
            });
        }

        // Send email to owner
        await sendContactEmail(name, email, phone, message);

        return res.status(200).json({
            success: true,
            message: 'Message sent successfully.',
        });
    } catch (error) {
        console.error('Contact Form submission error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send message. Please try again later.',
        });
    }
};
