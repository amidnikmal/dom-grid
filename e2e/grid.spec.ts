import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('only a windowful of rows exists in the DOM', async ({ page }) => {
  const stats = await page.getByTestId('stats').textContent()

  expect(stats).toContain('/ 5000')
  expect(await page.locator('.grid__tr').count()).toBeLessThan(40)
})

test('scrolling swaps the rendered rows', async ({ page }) => {
  await expect(page.getByTestId('row-0')).toBeVisible()

  await page.getByTestId('scroll-v').evaluate((el) => { el.scrollTop = 2_800 })

  await expect(page.getByTestId('row-0')).toHaveCount(0)
  await expect(page.getByTestId('row-100')).toBeVisible()
})

test('pinned columns stay put while the flow scrolls', async ({ page }) => {
  const pinned = page.getByTestId('th-id')
  const flowing = page.getByTestId('th-name')

  const before = (await pinned.boundingBox())!.x
  const flowBefore = (await flowing.boundingBox())!.x

  await page.getByTestId('scroll-h').evaluate((el) => { el.scrollLeft = 120 })

  // The scroll event lands asynchronously, so the assertion waits for it.
  await expect.poll(async () => (await flowing.boundingBox())!.x).toBeLessThan(flowBefore)
  expect((await pinned.boundingBox())!.x).toBeCloseTo(before, 0)
})

test('dragging the edge resizes a column', async ({ page }) => {
  const header = page.getByTestId('th-name')
  const before = (await header.boundingBox())!.width

  const resizer = page.getByTestId('resizer-name')
  const box = (await resizer.boundingBox())!

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()

  expect((await header.boundingBox())!.width).toBeGreaterThan(before + 40)
})

test('dragging a row by its handle reorders the list', async ({ page }) => {
  await expect(page.getByTestId('first-row')).toHaveText('name 0')

  const handle = page.getByTestId('handle-0')
  const box = (await handle.boundingBox())!

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 70, { steps: 8 })
  await page.mouse.up()

  await expect(page.getByTestId('first-row')).not.toHaveText('name 0')
})
