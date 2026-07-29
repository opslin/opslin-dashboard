import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AboutPage() {
    return (
        <>
            <Header
                title="About"
                description="Operational notes, runtime attributions, and bundled analytics components."
            />
            <div className="space-y-6 p-6">
                <Card className="max-w-3xl">
                    <CardHeader>
                        <CardTitle>GeoIP Attribution</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                        <p>
                            Request analytics can use the MaxMind GeoLite2 Country database for country-level enrichment.
                        </p>
                        <p>
                            This product includes GeoLite2 data created by MaxMind, available from
                            {" "}
                            <a
                                className="font-medium text-foreground underline"
                                href="https://www.maxmind.com"
                                target="_blank"
                                rel="noreferrer"
                            >
                                www.maxmind.com
                            </a>.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
