// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it } from 'vitest'
const {
  KROKI_URL,
  SUPPORTED_TYPES,
  PNG_SUPPORTED_TYPES,
  FORMAT_SUPPORT,
  TEXT_FORMATS,
  DEFAULT_FORMAT,
  ENABLED_ATTR,
  TYPES_ATTR,
  BUILTIN_ATTRIBUTES,
  isTruthy,
  resolveEnabledTypes,
  resolveFormat,
  isTextFormat,
  isPositionalOrOptionKey,
  resolveDiagramOptions,
} = require('./kroki-config')

describe('constants', () => {
  it('exposes the fixed loopback Kroki URL', () => {
    expect(KROKI_URL).toBe('http://localhost:8500')
  })

  it('exposes the attribute names both halves of Kroki support agree on', () => {
    expect(ENABLED_ATTR).toBe('kroki-enabled')
    expect(TYPES_ATTR).toBe('kroki-diagram-types')
  })

  it('exposes svg as the default format', () => {
    expect(DEFAULT_FORMAT).toBe('svg')
  })

  it('derives PNG_SUPPORTED_TYPES from FORMAT_SUPPORT', () => {
    for (const type of PNG_SUPPORTED_TYPES) {
      expect(FORMAT_SUPPORT[type]).toContain('png')
    }
    for (const type of SUPPORTED_TYPES) {
      if (FORMAT_SUPPORT[type].includes('png')) {
        expect(PNG_SUPPORTED_TYPES.has(type)).toBe(true)
      }
    }
  })

  it('every SUPPORTED_TYPES entry has a FORMAT_SUPPORT row', () => {
    for (const type of SUPPORTED_TYPES) {
      expect(Array.isArray(FORMAT_SUPPORT[type])).toBe(true)
      expect(FORMAT_SUPPORT[type]).toContain('svg')
    }
  })
})

describe('isTruthy', () => {
  it('treats the real boolean true as truthy', () => {
    expect(isTruthy(true)).toBe(true)
  })

  it('treats the string "true" as truthy', () => {
    expect(isTruthy('true')).toBe(true)
  })

  it.each([false, 'false', undefined, null, '', 0, 'yes'])('treats %s as not truthy', (value) => {
    expect(isTruthy(value)).toBe(false)
  })
})

describe('resolveEnabledTypes', () => {
  it('returns an empty set when kroki-enabled is not truthy', () => {
    const onUnknownType = () => {
      throw new Error('should not be called')
    }
    expect(resolveEnabledTypes(false, 'mermaid', onUnknownType).size).toBe(0)
    expect(resolveEnabledTypes(undefined, 'mermaid', onUnknownType).size).toBe(0)
  })

  it('returns every supported type when types are omitted', () => {
    const active = resolveEnabledTypes(true, undefined)
    expect(active.size).toBe(SUPPORTED_TYPES.length)
    expect(active.has('mermaid')).toBe(true)
  })

  it('returns every supported type when types is an empty string', () => {
    const active = resolveEnabledTypes('true', '')
    expect(active.size).toBe(SUPPORTED_TYPES.length)
  })

  it('parses a comma-separated, whitespace-tolerant list of requested types', () => {
    const active = resolveEnabledTypes(true, ' mermaid, plantuml ,graphviz')
    expect([...active].sort()).toEqual(['graphviz', 'mermaid', 'plantuml'])
  })

  it('reports each unknown type through onUnknownType and drops it', () => {
    const unknown = []
    const active = resolveEnabledTypes(true, 'mermaid,bogus,plantuml', (type) => unknown.push(type))
    expect(unknown).toEqual(['bogus'])
    expect([...active].sort()).toEqual(['mermaid', 'plantuml'])
  })

  it('does not call onUnknownType when typesAttr is omitted', () => {
    const onUnknownType = () => {
      throw new Error('should not be called when "all types" is meant')
    }
    resolveEnabledTypes(true, undefined, onUnknownType)
  })
})

describe('resolveFormat', () => {
  it('resolves the default format when the requested format is absent', () => {
    expect(resolveFormat('mermaid', undefined)).toBe('svg')
    expect(resolveFormat('mermaid', '')).toBe('svg')
    expect(resolveFormat('mermaid', 'svg')).toBe('svg')
  })

  it('resolves a supported non-default format', () => {
    expect(resolveFormat('mermaid', 'png')).toBe('png')
    expect(resolveFormat('plantuml', 'txt')).toBe('txt')
  })

  it('normalizes the jpg alias to jpeg for a type that supports it', () => {
    expect(resolveFormat('graphviz', 'jpg')).toBe('jpeg')
  })

  it('falls back to svg and reports via onUnsupported for an unsupported format', () => {
    const reported = []
    const format = resolveFormat('mermaid', 'jpeg', (type, requested) => reported.push([type, requested]))
    expect(format).toBe('svg')
    expect(reported).toEqual([['mermaid', 'jpeg']])
  })

  it('falls back to svg for an entirely unrecognized format string', () => {
    expect(resolveFormat('mermaid', 'bogus')).toBe('svg')
  })
})

describe('isTextFormat', () => {
  it('recognizes every TEXT_FORMATS entry', () => {
    for (const format of TEXT_FORMATS) {
      expect(isTextFormat(format)).toBe(true)
    }
  })

  it('does not treat svg/png as text formats', () => {
    expect(isTextFormat('svg')).toBe(false)
    expect(isTextFormat('png')).toBe(false)
  })
})

describe('isPositionalOrOptionKey', () => {
  it('recognizes a bare numeric index', () => {
    expect(isPositionalOrOptionKey('1')).toBe(true)
    expect(isPositionalOrOptionKey('42')).toBe(true)
  })

  it('recognizes an -option flag key', () => {
    expect(isPositionalOrOptionKey('collapsible-option')).toBe(true)
  })

  it('does not flag an ordinary named attribute', () => {
    expect(isPositionalOrOptionKey('theme')).toBe(false)
    expect(isPositionalOrOptionKey('view-key')).toBe(false)
  })
})

describe('resolveDiagramOptions', () => {
  it('forwards only the non-builtin named attributes, coerced to strings', () => {
    const attrs = {
      target: 'diagram.puml',
      format: 'svg',
      theme: 'hacker',
      'view-key': 'SystemContext',
      1: 'mermaid',
      'collapsible-option': '',
    }
    expect(resolveDiagramOptions(attrs)).toEqual({ theme: 'hacker', 'view-key': 'SystemContext' })
  })

  it('excludes every BUILTIN_ATTRIBUTES entry', () => {
    /** @type {Record<string, string>} */
    const attrs = {}
    for (const key of BUILTIN_ATTRIBUTES) attrs[key] = 'x'
    expect(resolveDiagramOptions(attrs)).toEqual({})
  })

  it('returns an empty object for no attributes at all', () => {
    expect(resolveDiagramOptions(undefined)).toEqual({})
    expect(resolveDiagramOptions({})).toEqual({})
  })
})
