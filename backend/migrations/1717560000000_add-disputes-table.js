/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('disputes', {
    id: { type: 'serial', primaryKey: true },
    market_id: { type: 'text', notNull: true, references: 'markets(market_id)' },
    reason: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'open' },
    admin_notes: { type: 'text' },
    final_outcome: { type: 'text' },
    raised_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    reviewed_at: { type: 'timestamptz' },
    resolved_at: { type: 'timestamptz' },
  });
  pgm.createIndex('disputes', 'market_id');
  pgm.createIndex('disputes', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('disputes');
};
