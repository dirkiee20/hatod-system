import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  listRestaurants,
  getRestaurant,
  getRestaurantMenu,
  createMenuCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getRestaurantOrders,
  updateRestaurantDetails,
  toggleRestaurantStatus
} from '../controllers/restaurantsController.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// Public endpoints
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('pageSize').optional().isInt({ min: 1, max: 100 }),
    query('isOpen').optional().isBoolean()
  ],
  validate,
  listRestaurants
);
router.get('/:restaurantId', [param('restaurantId').isUUID()], validate, getRestaurant);
router.get(
  '/:restaurantId/menu',
  [param('restaurantId').isUUID()],
  validate,
  getRestaurantMenu
);

// Authenticated restaurant owners / admins
router.use(authenticate, requireRoles('restaurant', 'admin'));

router.post(
  '/:restaurantId/menu/categories',
  [
    param('restaurantId').isUUID(),
    body('name').notEmpty(),
    body('displayOrder').optional().isInt({ min: 0 })
  ],
  validate,
  createMenuCategory
);

router.post(
  '/:restaurantId/menu/items',
  [
    param('restaurantId').isUUID(),
    body('name').notEmpty(),
    body('price').isFloat({ gt: 0 })
  ],
  validate,
  createMenuItem
);

router.put(
  '/:restaurantId/menu/items/:menuItemId',
  [param('restaurantId').isUUID(), param('menuItemId').isUUID()],
  validate,
  updateMenuItem
);

router.delete(
  '/:restaurantId/menu/items/:menuItemId',
  [param('restaurantId').isUUID(), param('menuItemId').isUUID()],
  validate,
  deleteMenuItem
);

router.get(
  '/:restaurantId/orders',
  [param('restaurantId').isUUID()],
  validate,
  getRestaurantOrders
);

router.patch(
  '/:restaurantId',
  [param('restaurantId').isUUID()],
  validate,
  updateRestaurantDetails
);

router.post(
  '/:restaurantId/toggle-status',
  [param('restaurantId').isUUID()],
  validate,
  toggleRestaurantStatus
);

export default router;

