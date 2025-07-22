const Child = require('../models/Child');
const User = require('../models/User'); // Parent is now User with role 'parent'

// POST /child/create
exports.addChild = async (req, res) => {
    try {
        const { name, age, deviceImei } = req.body;
        const parentId = req.user._id;

        if (!name || !age) {
            return res.status(400).json({ message: 'Please provide name and age.' });
        }

        // Check if deviceImei already exists
        if (deviceImei) {
            const existingChild = await Child.findOne({ deviceImei });
            if (existingChild) {
                return res.status(409).json({ message: 'Device with this IMEI is already registered.' });
            }
        }

        // Create new child
        const newChild = new Child({
            name,
            age,
            deviceImei: deviceImei || null,
            parentId
        });

        await newChild.save();

        const response = {
            message: 'Child created successfully.',
            child: {
                id: newChild._id,
                name: newChild.name,
                age: newChild.age,
                deviceImei: newChild.deviceImei
            }
        };

        res.status(201).json(response);
    } catch (error) {
        console.error('Error creating child:', error);
        res.status(500).json({ message: 'Server error during child creation.' });
    }
};