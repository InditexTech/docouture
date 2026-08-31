// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

/** `{{increment value}}` — value + 1, treating a falsy value as 0. */
const increment = (value: number | undefined | null): number => (value || 0) + 1

export = increment
