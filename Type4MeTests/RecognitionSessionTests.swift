import XCTest
@testable import Type4Me

final class RecognitionSessionTests: XCTestCase {
    func testInitialStateIsIdle() async {
        let session = RecognitionSession()
        let state = await session.state
        XCTAssertEqual(state, .idle)
    }

    func testSetState() async {
        let session = RecognitionSession()
        await session.setState(.recording)
        let state = await session.state
        XCTAssertEqual(state, .recording)
        await session.setState(.idle)
    }

    func testCanStartRecordingOnlyWhenIdle() async {
        let session = RecognitionSession()
        var canStart = await session.canStartRecording
        XCTAssertTrue(canStart)

        await session.setState(.recording)
        canStart = await session.canStartRecording
        XCTAssertFalse(canStart)
        await session.setState(.idle)
    }

    func testAudioChunksAreBufferedBeforeASRConnectAndFlushedAfterConnect() async throws {
        let session = RecognitionSession()
        let mock = MockSpeechRecognizer()

        await session._debugSetASRClient(mock, connected: false)

        for i in 0..<45 {
            let payload = Data("chunk-\(i)".utf8)
            try await session._debugSendAudioToASR(payload)
        }

        let bufferedBefore = await session._debugPendingAudioChunkCount()
        XCTAssertEqual(bufferedBefore, 40, "Should keep only the most recent buffered chunks")

        let sentBefore = await mock.sentAudioCount()
        XCTAssertEqual(sentBefore, 0, "No audio should be sent before ASR is connected")

        await session._debugSetASRConnected(true)
        try await session._debugFlushPendingAudioToASR()

        let bufferedAfter = await session._debugPendingAudioChunkCount()
        XCTAssertEqual(bufferedAfter, 0, "Buffer should be empty after flush")

        let sentAfter = await mock.sentAudioCount()
        XCTAssertEqual(sentAfter, 40, "Buffered chunks should be flushed after connection")
    }
}

private actor MockSpeechRecognizer: SpeechRecognizer {
    private var sent: [Data] = []

    func connect(config: any ASRProviderConfig, options: ASRRequestOptions) async throws {}

    func sendAudio(_ data: Data) async throws {
        sent.append(data)
    }

    func endAudio() async throws {}

    func disconnect() async {}

    var events: AsyncStream<RecognitionEvent> {
        get async { AsyncStream { continuation in continuation.finish() } }
    }

    func sentAudioCount() -> Int { sent.count }
}
