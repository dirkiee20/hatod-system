import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  getProfile,
  updateProfile,
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  listCustomerOrders
} from '../controllers/customersController.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router({ mergeParams: true });

router.use(authenticate, requireRoles('customer', 'admin'));

router.get('/:customerId/profile', [param('customerId').isUUID()], validate, getProfile);
router.put(
  '/:customerId/profile',
  [
    param('customerId').isUUID(),
    body('fullName').optional().isString().isLength({ min: 1 }),
    body('phone').optional().isString()
  ],
  validate,
  updateProfile
);

router.get(
  '/:customerId/addresses',
  [param('customerId').isUUID()],
  validate,
  listAddresses
);

router.post(
  '/:customerId/addresses',
  [
    param('customerId').isUUID(),
    body('streetAddress').notEmpty(),
    body('city').notEmpty(),
    body('zipCode').notEmpty(),
    body('isDefault').optional().isBoolean().toBoolean()
  ],
  validate,
  createAddress
);

router.put(
  '/:customerId/addresses/:addressId',
  [
    param('customerId').isUUID(),
    param('addressId').isUUID(),
    body('isDefault').optional().isBoolean().toBoolean()
  ],
  validate,
  updateAddress
);

router.delete(
  '/:customerId/addresses/:addressId',
  [param('customerId').isUUID(), param('addressId').isUUID()],
  validate,
  deleteAddress
);

router.get(
  '/:customerId/orders',
  [param('customerId').isUUID()],
  validate,
  listCustomerOrders
);

export default router;

