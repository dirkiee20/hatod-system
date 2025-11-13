import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  getUsers,
  getUserStats,
  createRestaurantUser,
  createDeliveryUser,
  deactivateUser,
  activateUser,
  getOverviewStats,
  getAdminOrders
} from '../controllers/adminController.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate, requireRoles('admin'));

router.get(
  '/users',
  [
    query('page').optional().isInt({ min: 1 }),
    query('pageSize').optional().isInt({ min: 1, max: 100 }),
    query('userType')
      .optional()
      .isIn(['all', 'customer', 'restaurant', 'delivery', 'admin']),
    query('status')
      .optional()
      .isIn(['all', 'active', 'inactive', 'suspended'])
  ],
  validate,
  getUsers
);

router.get('/users/stats', getUserStats);
router.get('/overview', getOverviewStats);
router.get(
  '/orders',
  [
    query('status').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('pageSize').optional().isInt({ min: 1, max: 100 }),
    query('restaurantId').optional().isUUID(),
    query('customerId').optional().isUUID()
  ],
  validate,
  getAdminOrders
);

router.post(
  '/users/restaurants',
  [
    body('firstName').notEmpty(),
    body('lastName').notEmpty(),
    body('email').isEmail(),
    body('password').isLength({ min: 8 }),
    body('restaurantName').notEmpty(),
    body('restaurantAddress').notEmpty(),
    body('status').optional().isIn(['active', 'inactive']),
    body('cuisineType').optional().isString()
  ],
  validate,
  createRestaurantUser
);

router.post(
  '/users/delivery',
  [
    body('firstName').notEmpty(),
    body('lastName').notEmpty(),
    body('email').isEmail(),
    body('password').isLength({ min: 8 }),
    body('vehicleType').optional().isString(),
    body('deliveryRadius').optional().isInt({ min: 1, max: 100 }),
    body('status').optional().isIn(['active', 'inactive'])
  ],
  validate,
  createDeliveryUser
);

router.patch(
  '/users/:userId/deactivate',
  [param('userId').isUUID()],
  validate,
  deactivateUser
);

router.patch(
  '/users/:userId/activate',
  [param('userId').isUUID()],
  validate,
  activateUser
);

export default router;

