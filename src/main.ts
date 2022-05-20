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
import * as yaml from 'js-yaml'
import {
  SNSClient,
  PublishCommand,
  PublishCommandInput
} from '@aws-sdk/client-sns'

async function publish(
  message: object,
  topicArn: string,
  region: string
): Promise<string> {
  const messageString = JSON.stringify(message)
  core.debug(messageString)
  const input: PublishCommandInput = {
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

function constructMessage(): object {
  const repository = process.env.GITHUB_REPOSITORY
  const commit = process.env.GITHUB_SHA
  const ref = process.env.GITHUB_REF || ''
  const githubAction = process.env.GITHUB_ACTION || ''
  const githubEventName = process.env.GITHUB_EVENT_NAME || ''
  const githubActor = process.env.GITHUB_ACTOR || ''
  const parameters = yaml.load(core.getInput('parameters')) || {}
  const messageAttributes = yaml.load(core.getInput('message_attributes')) || {}

  return {
    repository,
    commit,
    ref,
    githubEventName,
    githubActor,
    githubAction,
    parameters,
    messageAttributes
  }
}

export async function run(): Promise<void> {
  core.info('Spinnaker Pipeline Trigger :shipit:')

  const topicArn = core.getInput('topic_arn')
  const region = core.getInput('aws_region') || 'us-west-2'

  try {
    if (!topicArn) {
      throw new Error('Topic ARN is required.')
    }
    const message = constructMessage()
    core.debug(JSON.stringify(message))
    await publish(message, topicArn, region)
  } catch (error) {
    core.warning('Failed to publish message.')
    core.setFailed(error.message)
  }
}
