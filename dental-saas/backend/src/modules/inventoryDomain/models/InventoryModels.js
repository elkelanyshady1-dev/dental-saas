/**
 * InventoryModels.js (Proxy)
 * 
 * Re-routes to split model definition files.
 * In per-org mode, consumers should use getModel() for connection-bound resolution.
 * This proxy exports the definition objects (not frozen .default instances).
 */

const InventoryItemDef = require("./inventoryItem.model");
const InventoryTransactionDef = require("./inventoryTransaction.model");
const CaseCostSnapshotDef = require("./caseCostSnapshot.model");

module.exports = {
    InventoryItemDef,
    InventoryTransactionDef,
    CaseCostSnapshotDef
};
