(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./assets/vendor/pdf-lib.min.js'), require('./assets/contract-template.js'));
    else root.ContractPDF = factory(root.PDFLib, root.ContractTemplate);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(PDFLib, template) {
    const dateBR = value => value.split('-').reverse().join('/');
    const decimal = units => (units / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    async function generate(record) {
        const pdf = await PDFLib.PDFDocument.load(template.base64);
        const font = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
        const page = pdf.getPages()[0];
        const instructor = record.instructorSnapshot;
        const group = record.course + record.group + (record.shift ? '-' + record.shift : '');
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
        for (const [key, checked] of Object.entries(instructor.documents)) values['doc_' + key] = checked ? 'X' : '';
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
