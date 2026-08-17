/*
 * Entry point for `js/site.js`.
 *
 * Each module below is a self-contained IIFE that wires up one piece of page
 * behaviour on load. They are imported for their side effects only, in the
 * order implied by their numeric prefixes — that ordering is significant, so
 * keep new modules numbered and add them here explicitly.
 */
import './01-nav'
import './02-on-this-page'
import './03-fragment-jumper'
import './04-page-versions'
import './06-copy-to-clipboard'
import './08-theme'
import './09-heading-anchors'
