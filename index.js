import express from "express";
import { PrismaClient } from "@prisma/client";
import cors from "cors";

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// JSON parsing middleware with error handling
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  next(err);
});

app.use(express.json());

// Validate ID parameter middleware
const validateId = (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 1) {
    return res.status(400).json({ error: "Invalid ID parameter" });
  }
  req.params.id = id; // Store parsed id
  next();
};

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  console.error(new Date().toISOString(), err.stack);
  res.status(500).json({
    error: "Something went wrong!",
    message: err.message
  });
};

// Input validation middleware
const validateUserInput = (req, res, next) => {
  const { name, email, age } = req.body;
  
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: "Valid name is required" });
  }
  
  if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return res.status(400).json({ error: "Valid email is required" });
  }
  
  if (age !== undefined && (typeof age !== 'number' || age < 0 || !Number.isInteger(age))) {
    return res.status(400).json({ error: "Age must be a positive integer" });
  }
  
  // Sanitize input
  req.body.name = name.trim();
  req.body.email = email.toLowerCase().trim();
  
  next();
};

// Routes
// Get all users
app.get("/users", async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' }
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

// Get a single user
app.get("/users/:id", validateId, async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    res.json(user);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    next(error);
  }
});

// Create a new user
app.post("/users", validateUserInput, async (req, res, next) => {
  try {
    const { name, email, age } = req.body;
    const user = await prisma.user.create({
      data: { name, email, age }
    });
    res.status(201).json(user);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: "Email already exists" });
    }
    next(error);
  }
});

// Update a user (full)
app.put("/users/:id", validateId, validateUserInput, async (req, res, next) => {
  try {
    const { name, email, age } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, email, age },
    });
    res.json(user);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    if (error.code === 'P2002') {
      return res.status(409).json({ error: "Email already exists" });
    }
    next(error);
  }
});

// Update a user (partial)
app.patch("/users/:id", validateId, async (req, res, next) => {
  try {
    const { name, email, age } = req.body;
    const updateData = {};
    
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: "Valid name is required" });
      }
      updateData.name = name.trim();
    }
    
    if (email !== undefined) {
      if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        return res.status(400).json({ error: "Valid email is required" });
      }
      updateData.email = email.toLowerCase().trim();
    }
    
    if (age !== undefined) {
      if (typeof age !== 'number' || age < 0 || !Number.isInteger(age)) {
        return res.status(400).json({ error: "Age must be a positive integer" });
      }
      updateData.age = age;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid update data provided" });
    }
    
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
    });
    res.json(user);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    if (error.code === 'P2002') {
      return res.status(409).json({ error: "Email already exists" });
    }
    next(error);
  }
});

// Delete a user
app.delete("/users/:id", validateId, async (req, res, next) => {
  try {
    const deletedUser = await prisma.user.delete({
      where: { id: req.params.id },
    });
    res.json({
      message: `User ${deletedUser.name} deleted successfully`,
      user: deletedUser
    });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    next(error);
  }
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handler must be last
app.use(errorHandler);

// Create HTTP server separately to handle shutdown properly
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown handler
const shutdown = async () => {
  console.log('Shutting down gracefully...');
  
  // Close Express server
  server.close(() => {
    console.log('HTTP server closed');
  });

  try {
    // Disconnect Prisma Client
    await prisma.$disconnect();
    console.log('Database connection closed');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

// Handle various shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  shutdown();
});