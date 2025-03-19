import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import multer from "multer";
import authMiddleware from "./middlewares/authMiddleware.js";
import cloudinary from "cloudinary";
import streamifier from "streamifier";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const SECRET_KEY = process.env.JWT_SECRET;

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: "dntqcucm0",
  api_key: "527779671966668",
  api_secret: "PytC_XdWC1RcEeToT7i2jSC43B4",
});

// Middlewares
app.use(cors());
app.use(express.json());

// Conectar a MongoDB
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch((err) => console.log("Error al conectar con MongoDB:", err));
// Configuración de Multer (para leer archivos en memoria)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Modelo de Usuario
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model("User", UserSchema);

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
});

const Category = mongoose.model("Category", CategorySchema);

// Definir modelo de Producto
const ProductSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  image: String,
  activo: { type: Boolean, default: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
});

const Product = mongoose.model("Product", ProductSchema);

// Ruta principal
app.get("/", (req, res) => {
  res.send("API funcionando");
});
// Ruta para registrar usuario
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: "Usuario creado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error al registrar usuario" });
  }
});
// Ruta para login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Usuario no encontrado" });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Credenciales incorrectas" });
    const token = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: "1h" });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: "Error en el login" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

app.get("/public/categories", async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener categorías" });
  }
});

app.get("/public/products", async (req, res) => {
  try {
    const { categoryId } = req.query;
    const filter = { activo: true };
    if (categoryId) {
      filter.categoryId = categoryId; // Filtrar por categoría si se proporciona
    }
    const products = await Product.find(filter).populate("categoryId", "name");
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener productos" });
  }
});

app.post("/categories", authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    const newCategory = new Category({ name, userId: req.userId });
    await newCategory.save();
    res.status(201).json(newCategory);
  } catch (error) {
    res.status(500).json({ message: "Error al crear categoría" });
  }
});

app.get("/categories", authMiddleware, async (req, res) => {
  try {
    const categories = await Category.find({ userId: req.userId });
    if (!Array.isArray(categories)) {
      throw new Error("Error: La respuesta no es un array");
    }
    res.json(categories);
  } catch (error) {
    console.error("Error al obtener categorías:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

app.put("/categories/:id", authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    const category = await Category.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { name },
      { new: true }
    );
    if (!category)
      return res.status(404).json({ message: "Categoría no encontrada" });
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: "Error al actualizar categoría" });
  }
});

app.delete("/categories/:id", authMiddleware, async (req, res) => {
  try {
    const category = await Category.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!category)
      return res.status(404).json({ message: "Categoría no encontrada" });
    await Product.deleteMany({ categoryId: req.params.id, userId: req.userId });
    res.json({ message: "Categoría eliminada" });
  } catch (error) {
    res.status(500).json({ message: "Error al eliminar categoría" });
  }
});

// Ruta para subir imágenes a Cloudinary
app.post(
  "/upload",
  authMiddleware,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ message: "No se ha subido ninguna imagen" });
      }
      // Subir imagen a Cloudinary
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {},
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(stream);
      });
      res.json({ imageUrl: result.secure_url });
    } catch (error) {
      console.error("Error al subir imagen:", error);
      res.status(500).json({ message: "Error al subir imagen" });
    }
  }
);

// Crear producto dentro de una categoría
app.post("/products", authMiddleware, async (req, res) => {
  try {
    const { name, description, price, image, categoryId } = req.body;
    if (!image) {
      return res.status(400).json({ message: "La imagen es obligatoria" });
    }
    const newProduct = new Product({
      name,
      description,
      price,
      image,
      categoryId,
      userId: req.userId,
    });
    await newProduct.save();
    console.log("Producto creado:", newProduct);
    res.status(201).json(newProduct);
  } catch (error) {
    console.error("Error al crear producto:", error);
    res.status(500).json({ message: "Error al crear producto" });
  }
});

app.get("/products/:categoryId", authMiddleware, async (req, res) => {
  try {
    const products = await Product.find({
      categoryId: req.params.categoryId,
      userId: req.userId,
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener productos" });
  }
});

app.put(
  "/products/:id",
  authMiddleware,
  upload.single("image"),
  async (req, res) => {
    try {
      const { name, description, price } = req.body;
      const product = await Product.findOne({
        _id: req.params.id,
        userId: req.userId,
      });
      if (!product) {
        return res.status(404).json({ message: "Producto no encontrado" });
      }
      product.name = name || product.name;
      product.description = description || product.description;
      product.price = price || product.price;
      if (req.file) {
        // Eliminar la imagen anterior de Cloudinary si existe
        if (product.image) {
          const oldPublicId = product.image.split("/").pop().split(".")[0];
          try {
            await cloudinary.uploader.destroy(oldPublicId); // Elimina `products/`
            console.log(`Imagen ${oldPublicId} eliminada de Cloudinary`);
          } catch (error) {
            console.error(
              "Error al eliminar imagen anterior de Cloudinary:",
              error
            );
            return res
              .status(500)
              .json({ message: "Error al eliminar imagen anterior" });
          }
        }
        // Subir la nueva imagen a Cloudinary
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {}, // Elimina { folder: "products" }
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          streamifier.createReadStream(req.file.buffer).pipe(stream);
        });

        product.image = result.secure_url; // Guardar la nueva URL de imagen
      }

      const updatedProduct = await product.save();
      res.json(updatedProduct);
    } catch (error) {
      console.error("Error al actualizar producto:", error);
      res.status(500).json({ message: "Error al actualizar producto" });
    }
  }
);

app.put("/products/:id/toggle-active", authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }
    product.activo = !product.activo; // Alternar estado
    await product.save();
    res.json({ message: "Estado actualizado", activo: product.activo });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al actualizar estado del producto" });
  }
});

app.delete("/products/:id", authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }
    // Eliminar la imagen de Cloudinary
    if (product.image) {
      const publicId = product.image.split("/").pop().split(".")[0];
      try {
        // Elimina 'products/' de la ruta
        const result = await cloudinary.uploader.destroy(publicId);
        console.log("Respuesta de Cloudinary:", result);
        console.log(`Imagen ${publicId} eliminada de Cloudinary`);
      } catch (cloudinaryError) {
        console.error(
          `Error al eliminar imagen de Cloudinary:`,
          cloudinaryError
        );
      }
    }
    res.json({ message: "Producto eliminado" });
  } catch (error) {
    res.status(500).json({ message: "Error al eliminar producto" });
  }
});
