#include <napi.h>
#include "rtc-wrapper.h"
#include "peer-connection-wrapper.h"
#include "data-channel-wrapper.h"
#include "ice-udp-mux-listener-wrapper.h"

Napi::Object InitAll(Napi::Env env, Napi::Object exports)
{
    RtcWrapper::Init(env, exports);

    DataChannelWrapper::Init(env, exports);
    IceUdpMuxListenerWrapper::Init(env, exports);
    PeerConnectionWrapper::Init(env, exports);

    return exports;
}

NODE_API_MODULE(nodeDataChannel, InitAll)
