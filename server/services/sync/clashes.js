/**
 * P63. Two documents claiming one place: the same table, the same order's live
 * bill, the same name. Prompt section 4.
 *
 * The cafe PC's document keeps its place on both sides, so both end the same:
 *
 *   on the box    the incoming document is the website's: it is changed so it
 *                 no longer claims the place, then written. That write is a
 *                 change here and goes back, so the website gets the same.
 *   on the cloud  the incoming document is the PC's: the website's own
 *                 document is changed so it gives the place up, then the PC's
 *                 is written. The website's change goes to the PC.
 *
 * A clash with no rule here is not applied, and recorded for a person.
 */
import { SYNC_CONFLICT_KINDS, SYNC_NODES } from '../../models/SyncConflict.js';
import { recordConflict } from './conflicts.js';
import { syncNode } from './mode.js';

const VOID_NOTE = 'Voided by sync: this was also done on the cafe PC while the two were apart.';
const WEBSITE = ' (website)';

const renamed = (doc) => {
  const name = `${String(doc.name ?? '').replace(/ \(website\)$/, '')}${WEBSITE}`;
  return { ...doc, name, nameLower: name.toLowerCase() };
};
const voided = (doc) => ({
  ...doc,
  isVoided: true,
  voidedAt: doc.voidedAt ?? new Date(),
  voidReason: VOID_NOTE,
  updatedAt: new Date(),
});

/**
 * Per collection: the extra conditions of the partial unique index (to find the
 * other document), what giving up the place means, and the words for a person.
 */
export const CLASH_RULES = Object.freeze({
  orders: {
    partial: { occupiesTable: true },
    giveUp: (doc) => ({ ...doc, occupiesTable: false, updatedAt: new Date() }),
    detail: 'The same table was opened on the cafe PC and on the website. The PC\'s order keeps the table; the website\'s order is still open, without a table on the floor. Move it to a free table or join the two.',
  },
  bills: {
    partial: { isVoided: false },
    giveUp: (doc) => ({ ...voided(doc), voidReasonCode: 'OTHER' }),
    detail: 'The same order was billed on the cafe PC and on the website. The PC\'s bill stands; the website\'s was voided. Check what the guest paid, and refund any second payment.',
  },
  cashmovements: {
    partial: { type: 'OPENING_FLOAT', isVoided: false },
    giveUp: voided,
    detail: 'An opening float was entered on both. The PC\'s stands; the website\'s was voided.',
  },
  attendanceentries: {
    partial: { clockOutAt: null },
    giveUp: voided,
    detail: 'The same person was clocked in on both. The PC\'s shift stands; the website\'s was voided.',
  },
  menuitems: { partial: {}, giveUp: renamed, detail: 'A dish with this name was added on both. The website\'s was renamed "(website)".' },
  categories: { partial: {}, giveUp: renamed, detail: 'A menu section with this name was added on both. The website\'s was renamed "(website)".' },
  tables: { partial: {}, giveUp: renamed, detail: 'A table with this name was added on both. The website\'s was renamed "(website)".' },
  stations: { partial: {}, giveUp: renamed, detail: 'A station with this name was added on both. The website\'s was renamed "(website)".' },
  accounts: { partial: {}, giveUp: renamed, detail: 'An On Hold account with this name was added on both. The website\'s was renamed "(website)".' },
  ingredients: { partial: {}, giveUp: renamed, detail: 'An ingredient with this name was added on both. The website\'s was renamed "(website)".' },
  customers: {
    partial: {},
    giveUp: (doc) => ({ ...doc, phone: `${doc.phone}-website`, updatedAt: new Date() }),
    detail: 'The same guest was added on both. The PC\'s record keeps the mobile number; the website\'s is kept with "-website" after it.',
  },
  users: {
    partial: {},
    giveUp: (doc) => ({
      ...doc,
      isActive: false,
      phone: `${doc.phone}-website`,
      email: doc.email ? `${doc.email}.website` : doc.email ?? null,
      updatedAt: new Date(),
    }),
    detail: 'The same phone or email was given to two staff logins. The PC\'s login stands; the website\'s was switched off.',
  },
});

const isDuplicate = (error) => error?.code === 11000;
const isIdDuplicate = (error) => isDuplicate(error) && Object.keys(error.keyPattern ?? {}).join() === '_id';

/** Something here changed between reading it and writing: read again and decide again. */
export const RETRY = Symbol('retry');

/**
 * Writes `doc` (the incoming document, or the merge) by `_id`, only if what is
 * here is still `expected` (null: nothing was here). On a clash, applies the
 * rule. Gives back the document that ended up here, null when nothing was
 * written, or RETRY when this side changed it a moment ago.
 */
export async function writeWithClashRules(db, { restaurantId, coll, doc, incomingDoc, expected = null }) {
  const collection = db.collection(coll);
  const filter = expected
    ? { _id: doc._id, ...(expected.updatedAt !== undefined ? { updatedAt: expected.updatedAt } : {}) }
    : { _id: doc._id };
  try {
    const result = await collection.replaceOne(filter, doc, { upsert: !expected });
    if (expected && result.matchedCount === 0) return RETRY;
    return doc;
  } catch (error) {
    if (!expected && isIdDuplicate(error)) return RETRY;
    if (!isDuplicate(error)) throw error;
    const rule = CLASH_RULES[coll];
    const keyValue = error.keyValue ?? {};
    const other = Object.keys(keyValue).length
      ? await collection.findOne({ ...keyValue, ...(rule?.partial ?? {}), _id: { $ne: doc._id } })
      : null;
    if (!rule || !other) {
      await recordConflict(db, {
        restaurantId,
        coll,
        documentId: doc._id,
        kind: SYNC_CONFLICT_KINDS.SAME_SLOT,
        detail: `Not copied here: it breaks a rule only one record may hold (${Object.keys(error.keyPattern ?? {}).join(', ')}). A person decides which stays.`,
        keptFrom: syncNode(),
        localDoc: other,
        incomingDoc,
      });
      return null;
    }

    if (syncNode() === SYNC_NODES.BOX) {
      // The incoming document is the website's: it gives the place up.
      const parked = rule.giveUp(doc);
      await collection.replaceOne({ _id: parked._id }, parked, { upsert: true });
      await recordConflict(db, {
        restaurantId, coll, documentId: doc._id, kind: SYNC_CONFLICT_KINDS.SAME_SLOT, detail: rule.detail,
        keptFrom: SYNC_NODES.BOX, localDoc: other, incomingDoc, resultDoc: parked,
      });
      return parked;
    }

    // On the cloud the incoming document is the PC's: the website's own gives the place up first.
    const parked = rule.giveUp(other);
    await collection.replaceOne({ _id: other._id }, parked);
    try {
      await collection.replaceOne({ _id: doc._id }, doc, { upsert: true });
    } catch (again) {
      if (!isDuplicate(again)) throw again;
      // A second rule broken as well: leave it to a person.
      await recordConflict(db, {
        restaurantId, coll, documentId: doc._id, kind: SYNC_CONFLICT_KINDS.SAME_SLOT,
        detail: `Not copied here: it breaks a second rule only one record may hold (${Object.keys(again.keyPattern ?? {}).join(', ')}).`,
        keptFrom: SYNC_NODES.CLOUD, localDoc: parked, incomingDoc,
      });
      return null;
    }
    await recordConflict(db, {
      restaurantId, coll, documentId: other._id, kind: SYNC_CONFLICT_KINDS.SAME_SLOT, detail: rule.detail,
      keptFrom: SYNC_NODES.BOX, localDoc: other, incomingDoc, resultDoc: parked,
    });
    return doc;
  }
}
