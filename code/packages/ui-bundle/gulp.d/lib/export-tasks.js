// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: MPL-2.0

'use strict'

const exportTasks = (...tasks) => {
  const seed = {}
  if (tasks.length) {
    if (tasks.lastIndexOf(tasks[0]) > 0) {
      const task1 = tasks.shift()
      seed.default = Object.assign(task1.bind(null), { description: `=> ${task1.displayName}`, displayName: 'default' })
    }
    return tasks.reduce((acc, it) => {
      acc[it.displayName || it.name] = it
      return acc
    }, seed)
  } else {
    return seed
  }
}

module.exports = exportTasks
