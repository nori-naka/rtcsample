
const caluc_stats = function () {

    let last_timestamp = 0;
    let last_value = 0;
    
    return function (cur_timestamp, cur_value) {

        let period_timestamp = cur_timestamp - last_timestamp;
        let period_value = cur_value - last_value;

        last_timestamp = cur_timestamp;
        last_value = cur_value;

        return period_value / (period_timestamp / 1000);
    }
}

let report_timerid;
const getReport = (peer, display_elm) => {

    let last_video_bits_sent = 0;
    let last_video_bits_received = 0;
    let last_video_timestamp_sent = 0;
    let last_video_timestamp_received = 0;

    if (report_timerid) {
        clearInterval(report_timerid);
    }
    report_timerid = setInterval(function () {

        peer.getStats(null)
            .then(stats => {
                let statsOutput = "";

                stats.forEach(report => {

                    if (report.type == "inbound-rtp" && report.kind == "video") {

                        const cur_video_bits_received = 8 * report["bytesReceived"];
                        const cur_video_timestamp_received = report["timestamp"];
                        const period_received = cur_video_timestamp_received - last_video_timestamp_received;
                        const bps_received = (cur_video_bits_received - last_video_bits_received) / (period_received / 1000);
                        last_video_bits_received = cur_video_bits_received;
                        last_video_timestamp_received = cur_video_timestamp_received;

                        // console.log(`受信帯域=${Math.round(bps_received / 1000).toLocaleString()}Kbps`);
                        statsOutput += `受信:${Math.round(bps_received / 1000).toLocaleString()}Kbps/`;


                    } else if (report.type == "outbound-rtp" && report.kind == "video") {

                        const cur_video_bits_sent = 8 * report["bytesSent"];
                        const cur_video_timestamp_sent = report["timestamp"];
                        const period_sent = cur_video_timestamp_sent - last_video_timestamp_sent;
                        const bps_sent = (cur_video_bits_sent - last_video_bits_sent) / (period_sent / 1000);
                        last_video_bits_sent = cur_video_bits_sent;
                        last_video_timestamp_sent = cur_video_timestamp_sent;

                        // console.log(`送信帯域=${Math.round(bps_sent / 1000).toLocaleString()}Kbps`);
                        statsOutput += `送信:${Math.round(bps_sent / 1000).toLocaleString()}Kbps`

                    }

                    // if (report.type == "inbound-rtp") {
                    //     statsOutput += `<h2>Report: ${report.type}</h3>\n<strong>ID:</strong> ${report.id}<br>\n` +
                    //         `<strong>Timestamp:</strong> ${report.timestamp}<br>\n`;

                    //     // Now the statistics for this report; we intentially drop the ones we
                    //     // sorted to the top above

                    //     Object.keys(report).forEach(statName => {
                    //         if (statName !== "id" && statName !== "timestamp" && statName !== "type") {
                    //             statsOutput += `<strong>${statName}:</strong> ${report[statName]}<br>\n`;
                    //         }
                    //     });                        
                    // }

                });
                display_elm.innerText = statsOutput;
            })
            .catch((err) => {
                if (report_timerid) {
                    clearInterval(report_timerid);
                }
                console.log(`getReport ERROR:${err}`);
            });
    }, 1000);
}
