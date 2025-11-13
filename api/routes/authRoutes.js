import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, refresh } from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.post(
  '/register',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long'),
    body('fullName').notEmpty().withMessage('Full name is required'),
    body('role').optional().isIn(['customer', 'restaurant'])
  ],
  validate,
  register
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  validate,
  login
);

router.post(
  '/refresh',
  [body('refreshToken').notEmpty().withMessage('Refresh token is required')],
  validate,
  refresh
);

export default router;

