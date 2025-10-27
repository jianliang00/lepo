import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('codegen', () => {
  it('runs codegen cmd', async () => {
    const {stdout} = await runCommand('codegen')
    expect(stdout).to.contain('hello world')
  })

  it('runs codegen --name oclif', async () => {
    const {stdout} = await runCommand('codegen --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
