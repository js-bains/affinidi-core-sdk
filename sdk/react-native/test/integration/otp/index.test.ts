import 'mocha'

import '../env'

import { expect } from 'chai'
import { __dangerous } from '@affinidi/wallet-core-sdk'
import { TestmailInbox } from '@affinidi/wallet-core-sdk/dist/test-helpers'
import { MessageParameters } from '@affinidi/wallet-core-sdk/dist/dto'
import { AffinityWallet } from '../../../src/AffinityWallet'

import { getOptionsForEnvironment } from '../../helpers'
import { openAttestationDocument } from '../../factory/openAttestationDocument'

const signedCredentials = require('../../factory/signedCredentials')

const { TEST_SECRETS } = process.env
const { COGNITO_PASSWORD } = JSON.parse(TEST_SECRETS)

const credentialShareRequestToken =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NksifQ.e' +
  'yJpbnRlcmFjdGlvblRva2VuIjp7ImNyZWRlbnRpYWxSZXF1aXJlbWVudHMiOlt7InR5cGUiOls' +
  'iQ3JlZGVudGlhbCIsIlRlc3REZW5pc0NyZWQiXSwiY29uc3RyYWludHMiOlt7Ij09IjpbeyJ2Y' +
  'XIiOiJpc3N1ZXIifSwiZGlkOmpvbG86ZjU1OTI2NWI2YzFiZWNkNTYxMDljNTYyMzQzNWZhNzk' +
  '3YWQ0MzA4YTRhNjg2ZjhlZGE3MDlmMzM4N2QzMDNlNiJdfV19XSwiY2FsbGJhY2tVUkwiOiJod' +
  'HRwczovL2t1ZG9zLWlzc3Vlci1iYWNrZW5kLmFmZmluaXR5LXByb2plY3Qub3JnL2t1ZG9zX29' +
  'mZmVyaW5nLyJ9LCJleHAiOjE2MTI5NjE5NTY3NzAsInR5cCI6ImNyZWRlbnRpYWxSZXF1ZXN0I' +
  'iwianRpIjoiNDkyNjU3MmU2MzU0ZmIxOCIsImlzcyI6ImRpZDpqb2xvOmY1NTkyNjViNmMxYmV' +
  'jZDU2MTA5YzU2MjM0MzVmYTc5N2FkNDMwOGE0YTY4NmY4ZWRhNzA5ZjMzODdkMzAzZTYja2V5c' +
  'y0xIn0.4c0de5d6d44d77d38b4c8c7f5d099dee53f938c1baf8b35ded409fda9c44eac73f3' +
  '50b739ac0e5eb4add1961c88d9f0486b37be928bccf2b19fb5a1d2b7c9bbe'

const options: __dangerous.SdkOptions = getOptionsForEnvironment()
const { env } = options

const messageParameters: MessageParameters = {
  message: `Your verification code is: {{CODE}}`,
  subject: `Verification code`,
}

const waitForOtpCode = async (inbox: TestmailInbox): Promise<string> => {
  const { body } = await inbox.waitForNewEmail()
  return body.replace('Your verification code is: ', '')
}

const createInbox = () => new TestmailInbox({ prefix: env, suffix: 'otp.react-native' })

function checkIsString(value: string | unknown): asserts value is string {
  expect(value).to.be.a('string')
}

describe('AffinityWallet [OTP]', () => {
  it('Save Open Attestation credential and #deleteCredential scenario', async () => {
    const inbox = createInbox()
    const password = COGNITO_PASSWORD

    const signUpToken = await AffinityWallet.signUp(inbox.email, password, options, messageParameters)
    checkIsString(signUpToken)
    const signUpCode = await waitForOtpCode(inbox)

    const commonNetworkMember = await AffinityWallet.confirmSignUp(signUpToken, signUpCode, options)
    await commonNetworkMember.saveCredentials([openAttestationDocument])

    let credentials = await commonNetworkMember.getCredentials(credentialShareRequestToken)
    expect(credentials).to.have.length(0)

    credentials = await commonNetworkMember.getCredentials()
    expect(credentials).to.have.length(1)

    const firstCredential = credentials[0]
    const credentialIdToDelete = __dangerous.isW3cCredential(firstCredential)
      ? firstCredential.id
      : firstCredential.data.id

    await commonNetworkMember.deleteCredential(credentialIdToDelete)
    credentials = await commonNetworkMember.getCredentials()

    const credentialIds = credentials.map((credential: any) => {
      return __dangerous.isW3cCredential(credential) ? credential.id : credential.data.id
    })

    expect(credentialIds).to.not.include(credentialIdToDelete)
    expect(credentials).to.have.length(0)
  })

  it('#deleteCredentials scenario', async () => {
    const inbox = createInbox()
    const password = COGNITO_PASSWORD

    const signUpToken = await AffinityWallet.signUp(inbox.email, password, options, messageParameters)
    checkIsString(signUpToken)
    const signUpCode = await waitForOtpCode(inbox)

    const commonNetworkMember = await AffinityWallet.confirmSignUp(signUpToken, signUpCode, options)
    await commonNetworkMember.saveCredentials(signedCredentials)

    let credentials = await commonNetworkMember.getCredentials()
    expect(credentials).to.have.length(3)

    const credentialIdToDelete = credentials[1].id
    await commonNetworkMember.deleteCredential(credentialIdToDelete)

    credentials = await commonNetworkMember.getCredentials()
    const credentialIds = credentials.map((credential: any) => credential.id)

    expect(credentialIds).to.not.include(credentialIdToDelete)
    expect(credentials).to.have.length(2)

    await commonNetworkMember.deleteAllCredentials()

    credentials = await commonNetworkMember.getCredentials()
    expect(credentials).to.have.length(0)
  })

  it('#signIn with skipBackupEncryptedSeed and skipBackupCredentials, #storeEncryptedSeed, #signIn', async () => {
    const inbox = createInbox()

    const signInToken = await AffinityWallet.signIn(inbox.email, options, messageParameters)
    checkIsString(signInToken)
    const signInCode = await waitForOtpCode(inbox)

    const confirmSignInOptions = Object.assign({}, options, {
      skipBackupEncryptedSeed: true,
      skipBackupCredentials: true,
      issueSignupCredential: true,
    })

    const { commonNetworkMember } = await AffinityWallet.confirmSignIn(signInToken, signInCode, confirmSignInOptions)

    expect(commonNetworkMember.credentials).not.to.be.empty
    expect(commonNetworkMember).to.be.an.instanceof(AffinityWallet)

    const { password, accessToken, encryptedSeed } = commonNetworkMember

    await commonNetworkMember.signOut(options)

    const commonNetworkMember2 = new AffinityWallet(password, encryptedSeed, options)

    await commonNetworkMember2.storeEncryptedSeed('', '', accessToken)
    await commonNetworkMember2.signOut(options)

    const signInToken2 = await AffinityWallet.signIn(inbox.email, options, messageParameters)
    checkIsString(signInToken2)
    const signInCode2 = await waitForOtpCode(inbox)

    const result = await AffinityWallet.confirmSignIn(signInToken2, signInCode2, options)

    expect(result.commonNetworkMember).to.be.an.instanceof(AffinityWallet)
    expect(result.commonNetworkMember.credentials).to.be.empty
  })
})
