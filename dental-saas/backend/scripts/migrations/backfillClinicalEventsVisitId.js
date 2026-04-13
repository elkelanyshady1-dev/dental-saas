/**
 * Migration Script: Backfill `visitId` for historical `ClinicalEvent` records.
 * 
 * Context: In Phase 2 of the Visit-Centric Workflow Hardening, `visitId` was marked 
 * as required in the schema. Historical events lack this field, which causes 
 * event replay engine errors and audit inconsistencies.
 * 
 * Execution: Run this script via Node.js targeting the organization tenant database.
 */

const mongoose = require('mongoose');

// Assumes models have been initialized with appropriate tenant DB connections
async function backfillClinicalEventsVisitId(tenantDbConnection, organizationId) {
  const ClinicalEvent = tenantDbConnection.model('ClinicalEvent');
  const VisitRecord = tenantDbConnection.model('VisitRecord');

  console.log(`Starting ClinicalEvent backfill for org: ${organizationId}`);

  // 1. Find all events missing a visitId
  const orphanedEvents = await ClinicalEvent.find({ visitId: { $exists: false } }).sort({ createdAt: 1 });
  console.log(`Found ${orphanedEvents.length} orphaned ClinicalEvents.`);

  let backfilled = 0;
  let skipped = 0;

  for (const event of orphanedEvents) {
    // 2. Find the geographically/temporally closest visit session for this case
    // We look for a visit session that was active during the event's creation
    // or the closest one within a 24-hour window.
    const closestVisit = await VisitRecord.findOne({
      caseId: event.caseId,
      startedAt: { $lte: event.createdAt },
      // Allow ending up to 24h later or still active
      $or: [
        { endedAt: { $gte: event.createdAt } },
        { status: 'active' },
        { endedAt: null }
      ]
    }).sort({ startedAt: -1 });

    if (closestVisit) {
      event.visitId = closestVisit._id;
      await event.save();
      backfilled++;
    } else {
      // 3. Fallback: Create an ad-hoc administrative visit session for orphaned events
      // Alternatively, we could attach it to a "Legacy Data" placeholder visit.
      console.warn(`No valid visit session found for event ${event._id} on case ${event.caseId}`);
      
      const newLegacyVisit = await VisitRecord.create({
        organizationId: event.organizationId,
        caseId: event.caseId,
        patientId: event.patientId, // Ensure your event schema tracks patientId or derive from case
        startedAt: event.createdAt,
        endedAt: event.createdAt,
        status: 'completed',
        visitType: 'administrative',
        notes: 'Auto-generated legacy visit for orphaned clinical events.'
      });

      event.visitId = newLegacyVisit._id;
      await event.save();
      backfilled++;
    }
  }

  console.log(`Migration Complete: ${backfilled} backfilled, ${skipped} skipped.`);
}

module.exports = { backfillClinicalEventsVisitId };
