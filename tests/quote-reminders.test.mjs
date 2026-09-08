import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DAY_MS,
  DEFAULT_REMINDER_SETTINGS,
  getQuoteReminder,
  parseReminderSettings,
} from "../src/lib/quote-reminders.ts";

const sentAt = Date.parse("2026-09-01T10:00:00Z");
const quote = {
  status: "envoye",
  sent_at: new Date(sentAt).toISOString(),
  last_reminded_at: null,
  reminder_snoozed_until: null,
};
const get = (changes = {}, now = sentAt + 7 * DAY_MS, settings = DEFAULT_REMINDER_SETTINGS) =>
  getQuoteReminder({ ...quote, ...changes }, settings, now);

test("only sent quotes become due, in either supported status language", () => {
  for (const status of ["envoye", "sent"]) assert.equal(get({ status }).isDue, true);
  for (const status of [
    "draft",
    "brouillon",
    "accepted",
    "accepte",
    "refused",
    "refuse",
    "pieces_commandees",
    "annule",
  ]) {
    assert.equal(get({ status }), null);
  }
});

test("becomes due at exactly the configured delay", () => {
  assert.equal(get({}, sentAt + 7 * DAY_MS - 1).isDue, false);
  assert.equal(get().isDue, true);
  assert.equal(get({}, sentAt + 9 * DAY_MS).daysLate, 2);
  assert.equal(get({}, sentAt + DAY_MS, { enabled: true, delayDays: 1 }).isDue, true);
});

test("records a new interval after a completed follow-up", () => {
  const last_reminded_at = new Date(sentAt + 8 * DAY_MS).toISOString();
  assert.equal(get({ last_reminded_at }, sentAt + 10 * DAY_MS).isDue, false);
  assert.equal(get({ last_reminded_at }, sentAt + 15 * DAY_MS).isDue, true);
});

test("snooze persists until its deadline without counting a follow-up", () => {
  const reminder_snoozed_until = new Date(sentAt + 12 * DAY_MS).toISOString();
  assert.equal(get({ reminder_snoozed_until }, sentAt + 11 * DAY_MS).isDue, false);
  assert.equal(get({ reminder_snoozed_until }, sentAt + 12 * DAY_MS).isDue, true);
});

test("resending starts from the new sent timestamp", () => {
  assert.equal(
    get(
      {
        sent_at: new Date(sentAt + 20 * DAY_MS).toISOString(),
        last_reminded_at: new Date(sentAt + 8 * DAY_MS).toISOString(),
      },
      sentAt + 21 * DAY_MS,
    ).isDue,
    false,
  );
});

test("disabled reminders and unavailable delivery dates never become due", () => {
  assert.equal(get({}, sentAt + 100 * DAY_MS, { enabled: false, delayDays: 7 }), null);
  assert.equal(get({ sent_at: null }), null);
  assert.equal(get({ sent_at: "invalid" }), null);
});

test("settings validate integer bounds and preserve explicit disabling", () => {
  for (const value of [
    null,
    {},
    [],
    { delayDays: 0 },
    { delayDays: 366 },
    { delayDays: 1.5 },
    { delayDays: "7" },
  ]) {
    assert.equal(parseReminderSettings(value).delayDays, 7);
  }
  assert.deepEqual(parseReminderSettings({ enabled: false, delayDays: 30 }), {
    enabled: false,
    delayDays: 30,
  });
});
