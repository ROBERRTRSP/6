import type { NextFunction, Request, Response } from "express";

export type AdminRequest = Request & { admin?: true };

export function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction
) {
  if (req.session?.admin === true) {
    req.admin = true;
    return next();
  }
  return res.status(401).json({ error: "Unauthorized" });
}
