(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./assets/vendor/pdf-lib.min.js'), require('./assets/contract-template.js'), require('./contracts-core.js'));
    else root.ContractPDF = factory(root.PDFLib, root.ContractTemplate, root.ContractsCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(PDFLib, template, C) {
    const dateBR = value => value.split('-').reverse().join('/');
    const decimal = units => (units / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    async function generate(record) {
        const pdf = await PDFLib.PDFDocument.load(template.base64);
        const font = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
        const page = pdf.getPages()[0];
        const instructor = record.instructorSnapshot;
        const group = C.groupLabel(record);
        const values = {
            discipline: record.discipline, theory: ['theory','both'].includes(record.type) ? 'X' : '',
            practice: ['practice','both'].includes(record.type) ? 'X' : '',
            hours: decimal(record.hoursUnits), hourRate: (record.hourRateCents / 100).toFixed(2).replace('.', ','),
            group, startDate: dateBR(record.startDate), endDate: dateBR(record.endDate),
            name: instructor.name, document: instructor.document, address: instructor.address,
            number: instructor.number, complement: instructor.complement, neighborhood: instructor.neighborhood,
            city: instructor.city, state: instructor.state, postalCode: instructor.postalCode,
            pix: instructor.pix, requester: record.requester, requestDate: dateBR(record.requestDate),
            stubDiscipline: record.discipline, stubName: instructor.name, stubGroup: group,
            stubHours: decimal(record.hoursUnits), stubStart: dateBR(record.startDate),
            stubEnd: dateBR(record.endDate), stubRequest: dateBR(record.requestDate),
        };
        const useNotes = ['practice', 'both'].includes(record.type) && Boolean(record.notes?.trim());
        if (!useNotes) for (const [key, checked] of Object.entries(instructor.documents)) values['doc_' + key] = checked ? 'X' : '';
        if (useNotes) {
            const width = 539;
            function wrap(size) {
                const lines = [];
                for (const paragraph of record.notes.trim().split(/\r?\n/)) {
                    let line = '';
                    for (const word of paragraph.trim().split(/\s+/)) {
                        if (font.widthOfTextAtSize(word, size) > width) return null;
                        const next = line ? line + ' ' + word : word;
                        if (font.widthOfTextAtSize(next, size) > width) { lines.push(line); line = word; }
                        else line = next;
                    }
                    lines.push(line);
                }
                return lines;
            }
            let size = 10, lines;
            try {
                for (; size >= 8; size -= .5) { lines = wrap(size); if (lines && lines.length * (size + 2) <= 88) break; }
            } catch { throw new Error('As observações contêm caracteres não suportados no PDF.'); }
            if (size < 8 || !lines) throw new Error('As observações são longas demais para o espaço do checklist. Reduza o texto para gerar o PDF sem cortes.');
            page.drawRectangle({x:18.5,y:380.39,width:558,height:113,color:PDFLib.rgb(1,1,1)});
            page.drawRectangle({x:18.5,y:479.89,width:558,height:13.5,color:PDFLib.rgb(.9,.9,.9)});
            const heading = 'OBSERVAÇÕES';
            const bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
            page.drawText(heading,{x:(595.28-bold.widthOfTextAtSize(heading,9))/2,y:483.89,size:9,font:bold});
            lines.forEach((line,index)=>{if(line)page.drawText(line,{x:28,y:466.89-index*(size+2),size,font});});
        }
        for (const [key, value] of Object.entries(values)) {
            if (!value) continue;
            const box = template.fields[key];
            const text = String(value).replace(/\s+/g, ' ').trim();
            let size = box.size;
            let measured;
            try { measured = font.widthOfTextAtSize(text, size); }
            catch { throw new Error('O campo "' + key + '" contém caracteres não suportados no PDF. Use letras, números e pontuação.'); }
            while (measured > box.width && size > 6) {
                size = Math.max(6, size - .25);
                measured = font.widthOfTextAtSize(text, size);
            }
            if (measured > box.width) {
                // Duas linhas apenas quando a célula permite; nunca recortar conteúdo.
                let lines = [''];
                for (const word of text.split(' ')) {
                    const current = lines[lines.length - 1];
                    if (font.widthOfTextAtSize((current ? current + ' ' : '') + word, size) <= box.width) {
                        lines[lines.length - 1] = (current ? current + ' ' : '') + word;
                    } else lines.push(word);
                }
                if (lines.length > 2 || lines.some(line => font.widthOfTextAtSize(line,size) > box.width) || box.height < 14) {
                    throw new Error('O conteúdo de "' + key + '" é longo demais para o modelo. Abrevie esse campo antes de gerar o PDF.');
                }
                lines.forEach((line,index) => page.drawText(line,{x:box.x,y:box.y + (1-index)*7,size,font}));
            } else page.drawText(text, {x:box.x,y:box.y,size,font});
        }
        pdf.setTitle('Solicitação de contrato - ' + record.number);
        pdf.setSubject('Serviços educacionais - ' + group);
        pdf.setAuthor('Minhas Demandas');
        return pdf.save();
    }
    return { generate };
});
