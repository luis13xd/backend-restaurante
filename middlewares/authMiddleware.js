import jwt from 'jsonwebtoken';
import 'dotenv/config';

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Acceso no autorizado' });
    }

    const token = authHeader.split(' ')[1];
    const { id } = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = id;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Token inválido o expirado' });
  }
};

export default authMiddleware;
