// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

/** `{{year}}` — current year, for footer copyright lines. */
const year = (): string => new Date().getFullYear().toString()

export = year
