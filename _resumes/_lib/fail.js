"use strict";

/**
 * Stop with a message that says what to fix. Every rule in this library fails
 * this way, and each command prints the message without a stack trace.
 */
function fail(message) {
    throw new Error(message);
}

module.exports = { fail };
