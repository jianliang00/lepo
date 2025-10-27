import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('create:component', () => {
  it('runs create:component cmd', async () => {
    const {stdout} = await runCommand('create:component')
    expect(stdout).to.contain('hello world')
  })

  it('runs create:component --name oclif', async () => {
    const {stdout} = await runCommand('create:component --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
