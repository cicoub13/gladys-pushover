# Changelog

All notable changes to the Pushover integration for Gladys Assistant.

## [Unreleased]

## [0.1.2] - 2026-10-03

### Fixed

- A Pushover user key refused by Pushover is no longer tried again for 10
  minutes, and nothing is sent once the monthly quota is used up until it
  resets: repeated refusals could get the Gladys IP address temporarily blocked
  by Pushover.
- Camera images get 8 seconds to upload instead of 4, so a large image on a
  modest Internet connection is no longer lost.
- The connection status keeps showing the messages left this month once
  Pushover works again after an error.

## [0.1.1] - 2026-10-03

### Added

- First version: Gladys messages and camera images delivered to the Pushover
  apps. The administrator enters the Pushover application token, each user
  enters their own user key (and, optionally, the devices to target) in "My
  account".
