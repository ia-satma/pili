import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import type { User } from "@shared/schema";

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: string;
    }
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Local strategy for email/password authentication
  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email.toLowerCase());
          
          if (!user) {
            return done(null, false, { message: "Usuario no encontrado" });
          }

          if (!user.passwordHash) {
            return done(null, false, { message: "Contraseña no configurada" });
          }

          const isValid = await bcrypt.compare(password, user.passwordHash);
          if (!isValid) {
            return done(null, false, { message: "Contraseña incorrecta" });
          }

          return done(null, {
            id: user.id,
            email: user.email!,
            role: user.role,
          });
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user: Express.User, cb) => {
    cb(null, { id: user.id, email: user.email, role: user.role });
  });

  passport.deserializeUser((user: Express.User, cb) => {
    cb(null, user);
  });

  // Login endpoint
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: { message: string }) => {
      if (err) {
        console.error("Login error:", err);
        return res.status(500).json({ message: "Error de autenticación" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Credenciales inválidas" });
      }
      req.logIn(user, (err) => {
        if (err) {
          console.error("Login session error:", err);
          return res.status(500).json({ message: "Error al iniciar sesión" });
        }
        return res.json({ 
          success: true, 
          user: { id: user.id, email: user.email, role: user.role }
        });
      });
    })(req, res, next);
  });

  // Logout endpoint
  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Error al cerrar sesión" });
      }
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error:", err);
        }
        res.clearCookie("connect.sid");
        res.json({ success: true });
      });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "No autorizado" });
  }
  return next();
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "No autorizado" });
  }

  const dbUser = await storage.getUser(req.user.id);
  if (!dbUser || dbUser.role !== "admin") {
    return res.status(403).json({ message: "Acceso denegado - Se requiere rol de administrador" });
  }

  return next();
};

export const isEditor: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "No autorizado" });
  }

  const dbUser = await storage.getUser(req.user.id);
  if (!dbUser || (dbUser.role !== "admin" && dbUser.role !== "editor")) {
    return res.status(403).json({ message: "Acceso denegado - Se requiere rol de editor" });
  }

  return next();
};

export const isViewer: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "No autorizado" });
  }

  const dbUser = await storage.getUser(req.user.id);
  if (!dbUser) {
    return res.status(403).json({ message: "Usuario no encontrado" });
  }

  return next();
};

// Utility function to hash passwords
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

// Seed admin users
export async function seedAdminUsers() {
  const adminUsers = [
    { email: "pilararenasreina@gmail.com", password: "123456" },
    { email: "jorgealvarez_rincon@hotmail.com", password: "123456" },
  ];

  for (const admin of adminUsers) {
    const existing = await storage.getUserByEmail(admin.email);
    if (!existing) {
      const passwordHash = await hashPassword(admin.password);
      await storage.createUserWithPassword(
        admin.email,
        passwordHash,
        "admin",
        admin.email.split("@")[0]
      );
      console.log(`Admin user created: ${admin.email}`);
    } else if (!existing.passwordHash) {
      // Update existing user with password hash if missing
      const passwordHash = await hashPassword(admin.password);
      const { db } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(users)
        .set({ passwordHash, role: "admin" })
        .where(eq(users.id, existing.id));
      console.log(`Admin user updated with password: ${admin.email}`);
    } else {
      console.log(`Admin user already exists: ${admin.email}`);
    }
  }
}
