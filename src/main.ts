/*
Copyright 2021 Expedia, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import * as core from '@actions/core'
import * as github from '@actions/github'
import * as yaml from 'js-yaml'
import {
  PublishCommand,
  PublishInput,
  SNSServiceException,
  SNSClient
} from '@aws-sdk/client-sns'

const SNS_MESSAGE_SIZE_LIMIT_BYTES = 256000

interface GitHubFile {
  filename: string
  status: string
}

async function publish(
  message: object,
  topicArn: string,
  region: string
): Promise<string> {
  const messageString = JSON.stringify(message)
  core.debug(messageString)
  const input: PublishInput = {
    Message: messageString,
    TopicArn: topicArn
  }

  const config = { region }

  const client = new SNSClient(config)
  const command = new PublishCommand(input)
  const response = await client.send(command)

  core.debug(JSON.stringify(response.MessageId))
  return JSON.stringify(response.MessageId)
}

async function constructMessage(): Promise<object> {
  const repository = process.env.GITHUB_REPOSITORY
  const commit = process.env.GITHUB_SHA
  const githubApiUrl = process.env.GITHUB_API_URL
  const ref = process.env.GITHUB_REF || ''
  const githubAction = process.env.GITHUB_ACTION || ''
  const githubEventName = process.env.GITHUB_EVENT_NAME || ''
  const githubActor = process.env.GITHUB_ACTOR || ''
  const parameters = yaml.load(core.getInput('parameters')) || {}
  const messageAttributes = core.getInput('message_attributes') || ''
  const modifiedFiles = await getModifiedFiles()

  const message = {
    repository,
    commit,
    githubApiUrl,
    ref,
    githubEventName,
    githubActor,
    githubAction,
    parameters,
    messageAttributes,
    modifiedFiles
  }

  // SNS message size limit is 256 KB
  if (
    Buffer.byteLength(JSON.stringify(message)) > SNS_MESSAGE_SIZE_LIMIT_BYTES
  ) {
    core.warning(
      'SNS message size limit exceeded, removing modifiedFiles from message'
    )
    message.modifiedFiles = []
  }

  return message
}

async function getModifiedFiles(): Promise<string[]> {
  const token = core.getInput('github_token')
  if (!token) {
    core.debug(
      'No github token provided, defaulting to empty list of modified files'
    )
    return []
  }
  const octokit = github.getOctokit(token)
  const { data } = await octokit.rest.repos.getCommit({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    ref: github.context.sha
  })
  if (!data.files) {
    core.debug('No files found in getCommit response')
    return []
  }
  const files = data.files
    .filter((file: GitHubFile) => file.status !== 'removed')
    .map((file: GitHubFile) => file.filename)
  core.debug(`Found ${files.length} changed files`)
  return files
}

export async function run(): Promise<void> {
  core.info('Spinnaker Pipeline Trigger :shipit:')

  const topicArn = core.getInput('topic_arn')
  const region = core.getInput('aws_region') || 'us-west-2'

  try {
    if (!topicArn) {
      throw new Error('Topic ARN is required.')
    }
    const message = await constructMessage()
    core.debug(JSON.stringify(message))
    await publish(message, topicArn, region)
  } catch (error) {
    if (error instanceof SNSServiceException) core.warning(error.message)
    core.setFailed('Failed to publish message.')
  }
}
