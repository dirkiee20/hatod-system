import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  listAssignments,
  updateDeliveryStatus,
  claimDelivery
} from '../controllers/deliveryController.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate, requireRoles('delivery', 'admin'));

router.get(
  '/riders/:riderId/assignments',
  [param('riderId').isUUID(), query('status').optional().isString()],
  validate,
  listAssignments
);

router.patch(
  '/assignments/:deliveryId/status',
  [param('deliveryId').isUUID(), body('status').notEmpty()],
  validate,
  updateDeliveryStatus
);

router.post(
  '/assignments/:deliveryId/claim',
  [param('deliveryId').isUUID()],
  validate,
  claimDelivery
);

export default router;

