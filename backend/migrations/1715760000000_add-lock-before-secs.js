/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('markets', {
    lock_before_secs: { type: 'integer', notNull: true, default: 3600 },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('markets', ['lock_before_secs']);
};
