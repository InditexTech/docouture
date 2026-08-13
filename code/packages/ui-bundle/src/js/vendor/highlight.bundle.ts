/*
 * Syntax highlighting bundle.
 *
 * Only the languages listed here are shipped, to keep the bundle small. Add an
 * import plus a `registerLanguage` call to support another language.
 *
 * Upgraded from highlight.js 9 (deprecated upstream) to 11: the entry point
 * moved from `lib/highlight` to `lib/core`, and `highlightBlock` was renamed to
 * `highlightElement`.
 */
import hljs from 'highlight.js/lib/core'

import asciidoc from 'highlight.js/lib/languages/asciidoc'
import bash from 'highlight.js/lib/languages/bash'
import clojure from 'highlight.js/lib/languages/clojure'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import elixir from 'highlight.js/lib/languages/elixir'
import go from 'highlight.js/lib/languages/go'
import groovy from 'highlight.js/lib/languages/groovy'
import haskell from 'highlight.js/lib/languages/haskell'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import julia from 'highlight.js/lib/languages/julia'
import kotlin from 'highlight.js/lib/languages/kotlin'
import lua from 'highlight.js/lib/languages/lua'
import markdown from 'highlight.js/lib/languages/markdown'
import nix from 'highlight.js/lib/languages/nix'
import objectivec from 'highlight.js/lib/languages/objectivec'
import perl from 'highlight.js/lib/languages/perl'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import properties from 'highlight.js/lib/languages/properties'
import puppet from 'highlight.js/lib/languages/puppet'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scala from 'highlight.js/lib/languages/scala'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

hljs.registerLanguage('asciidoc', asciidoc)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('clojure', clojure)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('elixir', elixir)
hljs.registerLanguage('go', go)
hljs.registerLanguage('groovy', groovy)
hljs.registerLanguage('haskell', haskell)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('julia', julia)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('lua', lua)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('nix', nix)
hljs.registerLanguage('objectivec', objectivec)
hljs.registerLanguage('perl', perl)
hljs.registerLanguage('php', php)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('properties', properties)
hljs.registerLanguage('puppet', puppet)
hljs.registerLanguage('python', python)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('scala', scala)
hljs.registerLanguage('shell', shell)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)

// `none` is the language Asciidoctor emits for an unannotated source block.
hljs.registerLanguage('none', plaintext)

document.querySelectorAll<HTMLElement>('pre code.hljs[data-lang]').forEach((node) => {
  hljs.highlightElement(node)
})
