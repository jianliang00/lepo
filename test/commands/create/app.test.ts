import {runCommand} from '@oclif/test'
import chai from 'chai'
const {expect} = chai
import {createSandbox, SinonSandbox} from 'sinon'

describe('create:src', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('runs create:src --name lepo', async () => {
    const {stdout} = await runCommand('create:src --name lepo')
    expect(stdout).to.contain('Hello lepo from src/commands/create/src.ts!')
  })
})
