import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('run:android', () => {
  it('runs run:android cmd', async () => {
    const {stdout} = await runCommand('run:android')
    expect(stdout).to.contain('hello world')
  })

  it('runs run:android --name oclif', async () => {
    const {stdout} = await runCommand('run:android --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
