const Customer = require("../modals/Customer");

// Add address
exports.addAddress = async (req, res, next) => {
  try {
    const customerId = req.user?._id;
    if (!customerId || req.user.role !== "customer") {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { label, street, streetNumber, postalCode, city, country, coordinates, isDefault } = req.body;

    if (!label || !street || !postalCode || !city) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      customer.addresses.forEach((addr) => {
        addr.isDefault = false;
      });
    }

    // Add new address
    customer.addresses.push({
      label,
      street,
      streetNumber,
      postalCode,
      city,
      country: country || "Germany",
      coordinates: coordinates || null,
      isDefault: isDefault || false,
    });

    await customer.save();

    res.status(201).json({
      success: true,
      message: "Address added successfully",
      data: customer.addresses[customer.addresses.length - 1],
    });
  } catch (error) {
    next(error);
  }
};

// Get all addresses
exports.getAddresses = async (req, res, next) => {
  try {
    const customerId = req.user?._id;
    if (!customerId || req.user.role !== "customer") {
      return res.status(401).json({ message: "Authentication required" });
    }

    const customer = await Customer.findById(customerId).select("addresses").lean();
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.status(200).json({
      success: true,
      data: customer.addresses || [],
    });
  } catch (error) {
    next(error);
  }
};

// Update address
exports.updateAddress = async (req, res, next) => {
  try {
    const customerId = req.user?._id;
    if (!customerId || req.user.role !== "customer") {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { addressId } = req.params;
    const { label, street, streetNumber, postalCode, city, country, coordinates, isDefault } = req.body;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const address = customer.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      customer.addresses.forEach((addr) => {
        if (addr._id.toString() !== addressId) {
          addr.isDefault = false;
        }
      });
    }

    // Update address
    if (label) address.label = label;
    if (street) address.street = street;
    if (streetNumber !== undefined) address.streetNumber = streetNumber;
    if (postalCode) address.postalCode = postalCode;
    if (city) address.city = city;
    if (country) address.country = country;
    if (coordinates !== undefined) address.coordinates = coordinates;
    if (isDefault !== undefined) address.isDefault = isDefault;

    await customer.save();

    res.status(200).json({
      success: true,
      message: "Address updated successfully",
      data: address,
    });
  } catch (error) {
    next(error);
  }
};

// Delete address
exports.deleteAddress = async (req, res, next) => {
  try {
    const customerId = req.user?._id;
    if (!customerId || req.user.role !== "customer") {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { addressId } = req.params;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const address = customer.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    customer.addresses.pull(addressId);
    await customer.save();

    res.status(200).json({
      success: true,
      message: "Address deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};


