class AttachmentProcessor {
  match(_input) {
    return false
  }

  normalize(_input) {
    throw new Error('AttachmentProcessor.normalize() must be implemented')
  }

  preparePreview(attachment) {
    return attachment
  }

  extractForAgent(attachment) {
    return { attachments: [attachment] }
  }

  async sendOutbound(attachment, _target, _handlers = {}) {
    return { mode: 'noop', attachment }
  }
}

module.exports = { AttachmentProcessor }
