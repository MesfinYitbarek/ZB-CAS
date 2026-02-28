// seedUser.js
import mongoose from "mongoose";
import dotenv from "dotenv";

import User from "./src/models/User.js";

dotenv.config();

const seedUser = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");

    // Generate temporary password
    const tempPassword = 12345678;

    const user = await User.create({
      employeeId: "EMP00",
      name: "HR Admin",
      email: "mickey@admin.com",
      passwordHash: tempPassword, // Will be hashed by pre-save hook
      role: "HR_ADMIN",
      position: "HR Manager",
      department: "Human Resources",
      supervisorId: null,
    });

    console.log("✅ User created successfully");
    console.log("Temporary Password:", tempPassword);
    console.log("User:", user.toPublic());

    process.exit();
  } catch (error) {
    console.error("❌ Error seeding user:", error.message);
    process.exit(1);
  }
};

seedUser();