module.exports = {
  /**
   * Verifies that an object is a function.
   * @param {Object} obj - Object to check
   * @returns 
   */
  isFunction: function(obj) {
    return !!(obj && obj.constructor && obj.call && obj.apply);
  },

  /**
   * Compare two dates.
   * @param {Date} date1 Date to compare
   * @param {Date} date2 Date to compare
   * @returns True if date1 is before date 2, False otherwise.
   */
  isBefore: function(date1, date2) {
    return date1 < date2;
  }
};
