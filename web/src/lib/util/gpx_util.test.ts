import { describe, expect, it } from "vitest";
import { extractImageUrls, fromKML, gpx2trail } from "./gpx_util";

describe("KML waypoint imports", () => {
    it("preserves embedded image descriptions for waypoint photo imports", async () => {
        const imageUrl = "https://down-files.2bulu.com/f/d1?downParams=test%0A";
        const kml = `<?xml version="1.0" encoding="UTF-8"?>
            <kml xmlns="http://www.opengis.net/kml/2.2">
                <Document>
                    <name>Two Steps Trail</name>
                    <Placemark>
                        <name>Notes only</name>
                        <description>Not a waypoint</description>
                    </Placemark>
                    <Placemark>
                        <name>Waterfall</name>
                        <description><![CDATA[<div><a href="" target="_blank"><img src="${imageUrl}" /></a></div>]]></description>
                        <Point><coordinates>107.210857,29.053544,1054</coordinates></Point>
                    </Placemark>
                    <Placemark>
                        <name>Route</name>
                        <LineString><coordinates>107.2,29.0,900 107.3,29.1,950</coordinates></LineString>
                    </Placemark>
                </Document>
            </kml>`;

        const result = await gpx2trail(fromKML(kml));
        const waypoint = result.trail.expand?.waypoints_via_trail?.[0];

        expect(result.trail.name).toBe("Two Steps Trail");
        expect(waypoint?.name).toBe("Waterfall");
        expect(extractImageUrls(waypoint?.description)).toEqual([imageUrl]);
        expect(waypoint?.description).not.toContain("<a");
        expect(waypoint?.description).not.toContain("href=");
        expect(waypoint?.description).toContain(`<img src="${imageUrl}"`);
    });

    it("preserves gx:Track timestamps", async () => {
        const kml = `<?xml version="1.0" encoding="UTF-8"?>
            <kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
                <Document>
                    <name>Timed Trail</name>
                    <Placemark>
                        <gx:Track>
                            <when>2025-04-05T01:02:03Z</when>
                            <when>2025-04-05T01:03:03Z</when>
                            <gx:coord>107.2 29.0 900</gx:coord>
                            <gx:coord>107.3 29.1 950</gx:coord>
                        </gx:Track>
                    </Placemark>
                </Document>
            </kml>`;

        const result = await gpx2trail(fromKML(kml));
        const points = result.gpx.trk?.[0]?.trkseg?.[0]?.trkpt;

        expect(result.trail.name).toBe("Timed Trail");
        expect(points?.map((point) => point.time?.toISOString())).toEqual([
            "2025-04-05T01:02:03.000Z",
            "2025-04-05T01:03:03.000Z",
        ]);
        expect(result.trail.date).toBe("2025-04-05");
    });
});
