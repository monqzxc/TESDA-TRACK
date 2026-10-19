import { afterEach, describe, expect, it } from 'vitest'
import { returnFocus } from './focus.ts'

afterEach(() => {
  document.body.replaceChildren()
})

function addButton() {
  const button = document.createElement('button')
  document.body.append(button)
  return button
}

/** A dialog on its way out, with focus still on a button inside it. */
function closingDialog() {
  const dialog = document.createElement('div')
  dialog.append(document.createElement('button'))
  document.body.append(dialog)
  dialog.querySelector('button')?.focus()
  return dialog
}

describe('returnFocus', () => {
  it('puts focus on the target when focus fell to the page', () => {
    const target = addButton()

    returnFocus(target)

    expect(target).toHaveFocus()
  })

  it('takes focus out of the dialog that is closing', () => {
    const target = addButton()
    const dialog = closingDialog()

    returnFocus(target, dialog)

    expect(target).toHaveFocus()
  })

  it('leaves focus alone once it has been put somewhere else', () => {
    const target = addButton()
    const dialog = closingDialog()
    const elsewhere = addButton()
    elsewhere.focus()

    returnFocus(target, dialog)

    expect(elsewhere).toHaveFocus()
  })

  it('does nothing when the target has gone', () => {
    const target = addButton()
    target.remove()
    const dialog = closingDialog()

    returnFocus(target, dialog)

    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })
})
