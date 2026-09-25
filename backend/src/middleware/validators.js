import { body, validationResult } from 'express-validator';
import AppError from '../utils/AppError.js';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Return first error message
    return next(new AppError(errors.array()[0].msg, 400));
  }
  next();
};

export const loginValidation = [
  body('username').trim().notEmpty().withMessage('Username is required').isLength({ max: 50 }).withMessage('Username is too long'),
  body('password').notEmpty().withMessage('Password is required').isLength({ max: 128 }).withMessage('Password is too long'),
  validateRequest,
];

export const registerValidation = [
  body('username').trim().notEmpty().withMessage('Username is required').isLength({ max: 50 }),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  validateRequest,
];
