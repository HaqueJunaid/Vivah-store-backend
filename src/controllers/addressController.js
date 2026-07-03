import { Address } from '../models/Address.js';

// Get all addresses for the logged in user
export const getAddresses = async (req, res) => {
    try {
        const userId = req.user.id;
        const addresses = await Address.find({ user: userId }).sort({ createdAt: -1 });
        return res.status(200).json({
            success: true,
            addresses,
        });
    } catch (error) {
        console.error('Error fetching addresses:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch addresses',
        });
    }
};

// Create a new address for logged in user
export const createAddress = async (req, res) => {
    try {
        const userId = req.user.id;
        const { firstName, lastName, company, country, address, apartment, city, postalCode, phone } = req.body;

        if (!firstName || !lastName || !country || !address || !city || !postalCode || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required address fields',
            });
        }

        const newAddress = await Address.create({
            user: userId,
            firstName,
            lastName,
            company: company || '',
            country,
            address,
            apartment: apartment || '',
            city,
            postalCode,
            phone,
        });

        return res.status(201).json({
            success: true,
            message: 'Address added successfully',
            address: newAddress,
        });
    } catch (error) {
        console.error('Error creating address:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create address',
        });
    }
};

// Edit / Update address for logged in user
export const updateAddress = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { firstName, lastName, company, country, address, apartment, city, postalCode, phone } = req.body;

        const existingAddress = await Address.findOne({ _id: id, user: userId });
        if (!existingAddress) {
            return res.status(404).json({
                success: false,
                message: 'Address not found',
            });
        }

        if (firstName !== undefined) existingAddress.firstName = firstName;
        if (lastName !== undefined) existingAddress.lastName = lastName;
        if (company !== undefined) existingAddress.company = company;
        if (country !== undefined) existingAddress.country = country;
        if (address !== undefined) existingAddress.address = address;
        if (apartment !== undefined) existingAddress.apartment = apartment;
        if (city !== undefined) existingAddress.city = city;
        if (postalCode !== undefined) existingAddress.postalCode = postalCode;
        if (phone !== undefined) existingAddress.phone = phone;

        await existingAddress.save();

        return res.status(200).json({
            success: true,
            message: 'Address updated successfully',
            address: existingAddress,
        });
    } catch (error) {
        console.error('Error updating address:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update address',
        });
    }
};

// Delete address for logged in user
export const deleteAddress = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const deletedAddress = await Address.findOneAndDelete({ _id: id, user: userId });
        if (!deletedAddress) {
            return res.status(404).json({
                success: false,
                message: 'Address not found',
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Address deleted successfully',
            id,
        });
    } catch (error) {
        console.error('Error deleting address:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete address',
        });
    }
};
